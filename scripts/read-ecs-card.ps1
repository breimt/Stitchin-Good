[CmdletBinding()]
param(
    [string]$PortName = 'COM3',
    [string]$OutputDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'captures')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$baseBaud = 9600
$ack = [byte]0x06
$nak = [byte]0x15
$blockSize = 128
$blockPacketSize = 132

$capacities = @{
    0x12 = 128KB
    0x13 = 256KB
    0x14 = 512KB
    0x21 = 1MB
    0x22 = 128KB
    0x23 = 256KB
    0x31 = 512KB
    0x32 = 128KB
    0x33 = 256KB
    0xF0 = 512KB
}

function Get-Checksum {
    param([byte[]]$Bytes, [int]$Count = $Bytes.Length)
    $sum = 0
    for ($index = 0; $index -lt $Count; $index++) {
        $sum = ($sum + $Bytes[$index]) -band 0xFF
    }
    return [byte]$sum
}

function New-CommandPacket {
    param([char]$Command)
    $prefix = [byte]0x43
    $commandByte = [byte][char]$Command
    return [byte[]]($prefix, $commandByte, [byte](($prefix + $commandByte) -band 0xFF))
}

function Read-Exact {
    param(
        [System.IO.Ports.SerialPort]$Port,
        [int]$Count,
        [int]$TimeoutMilliseconds
    )
    $buffer = [byte[]]::new($Count)
    $received = 0
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($received -lt $Count) {
        if ($timer.ElapsedMilliseconds -ge $TimeoutMilliseconds) {
            $partialHex = if ($received -gt 0) {
                ($buffer[0..($received - 1)] | ForEach-Object { $_.ToString('X2') }) -join ' '
            }
            else {
                '<none>'
            }
            throw "Timed out after receiving $received of $Count bytes at $($Port.BaudRate) baud; partial bytes: $partialHex"
        }
        $available = $Port.BytesToRead
        if ($available -gt 0) {
            $wanted = [Math]::Min($Count - $received, $available)
            $received += $Port.Read($buffer, $received, $wanted)
        }
        else {
            Start-Sleep -Milliseconds 2
        }
    }
    return ,$buffer
}

function Invoke-CardStatusQuery {
    param([System.IO.Ports.SerialPort]$Port)
    $packet = New-CommandPacket 'T'
    $Port.DiscardInBuffer()
    $Port.Write($packet, 0, $packet.Length)
    $response = Read-Exact $Port 3 1500
    if ($response[0] -ne 0x41) { throw ('Unexpected CT response prefix {0:X2}.' -f $response[0]) }
    if ((Get-Checksum $response 2) -ne $response[2]) { throw 'Invalid CT response checksum.' }
    return $response[1]
}

function Set-EcsBaudLevel {
    param(
        [System.IO.Ports.SerialPort]$Port,
        [int]$Level,
        [int]$BaudRate
    )
    $command = [char]([int][char]'0' + $Level)
    $packet = New-CommandPacket $command
    $Port.DiscardInBuffer()
    $Port.Write($packet, 0, $packet.Length)
    $response = Read-Exact $Port 1 1500
    if ($response[0] -ne $ack) {
        throw ('ECS rejected baud level {0}; response was {1:X2}.' -f $Level, $response[0])
    }
    $Port.BaudRate = $BaudRate
    Start-Sleep -Milliseconds 30
}

function Reset-EcsBaud {
    param([System.IO.Ports.SerialPort]$Port)
    if (-not $Port.IsOpen -or $Port.BaudRate -eq $baseBaud) { return }
    try {
        $packet = New-CommandPacket '0'
        $Port.DiscardInBuffer()
        $Port.Write($packet, 0, $packet.Length)
        $null = Read-Exact $Port 1 1000
    }
    catch {
        Write-Warning "Could not confirm the ECS base-speed command: $($_.Exception.Message)"
    }
    finally {
        $Port.BaudRate = $baseBaud
    }
}

$port = [System.IO.Ports.SerialPort]::new(
    $PortName,
    $baseBaud,
    [System.IO.Ports.Parity]::None,
    8,
    [System.IO.Ports.StopBits]::One
)
$port.Handshake = [System.IO.Ports.Handshake]::None
$port.RtsEnable = $true
$port.DtrEnable = $false
$port.ReadTimeout = 250
$port.WriteTimeout = 1500

$timer = [Diagnostics.Stopwatch]::StartNew()
try {
    $port.Open()
    $port.DiscardInBuffer()
    $port.DiscardOutBuffer()

    $rawStatus = Invoke-CardStatusQuery $port
    if (-not $capacities.ContainsKey([int]$rawStatus)) {
        throw ('Unsupported or absent card status 0x{0:X2}.' -f $rawStatus)
    }
    $capacity = [int]$capacities[[int]$rawStatus]
    $blockCount = [int]($capacity / $blockSize)
    Write-Output ('Card status 0x{0:X2}; capacity {1:N0} bytes; {2:N0} blocks.' -f $rawStatus, $capacity, $blockCount)

    $levels = @(
        @{ Level = 1; Baud = 19200 },
        @{ Level = 2; Baud = 38400 },
        @{ Level = 3; Baud = 57600 },
        @{ Level = 4; Baud = 115200 }
    )
    foreach ($setting in $levels) {
        Set-EcsBaudLevel $port $setting.Level $setting.Baud
        $confirmedStatus = Invoke-CardStatusQuery $port
        if ($confirmedStatus -ne $rawStatus) {
            throw ('Card status changed during baud negotiation: 0x{0:X2} to 0x{1:X2}.' -f $rawStatus, $confirmedStatus)
        }
    }
    Write-Output "ECS communication verified at $($port.BaudRate) baud."

    $readCommand = New-CommandPacket 'R'
    $port.DiscardInBuffer()
    $port.Write($readCommand, 0, $readCommand.Length)
    $beginResponse = Read-Exact $port 1 2000
    if ($beginResponse[0] -ne $ack) {
        throw ('ECS rejected the read command; response was {0:X2}.' -f $beginResponse[0])
    }

    $image = [byte[]]::new($capacity)
    $capturedBlockCount = 0
    $terminalAckReceived = $false
    for ($blockIndex = 0; $blockIndex -lt $blockCount; $blockIndex++) {
        $control = $ack
        $accepted = $false
        for ($attempt = 1; $attempt -le 4 -and -not $accepted; $attempt++) {
            $port.Write([byte[]]($control), 0, 1)
            try {
                $firstByte = (Read-Exact $port 1 2500)[0]
                if ($firstByte -eq $ack) {
                    $terminalAckReceived = $true
                    break
                }
                if ($firstByte -eq $nak) {
                    if ($attempt -eq 4) { throw "ECS returned NAK four times for block $blockIndex." }
                    $control = $nak
                    continue
                }
                $packet = [byte[]]::new($blockPacketSize)
                $packet[0] = $firstByte
                $remainder = Read-Exact $port ($blockPacketSize - 1) 2500
                [Array]::Copy($remainder, 0, $packet, 1, $remainder.Length)
            }
            catch {
                if ($attempt -eq 4) { throw }
                Write-Warning "Block $blockIndex attempt $attempt timed out; requesting retransmission. $($_.Exception.Message)"
                $port.DiscardInBuffer()
                $control = $nak
                continue
            }
            $receivedIndex = ([int]$packet[1] -shl 8) -bor $packet[2]
            $valid = $packet[0] -eq 0x01 -and
                $receivedIndex -eq $blockIndex -and
                (Get-Checksum $packet ($blockPacketSize - 1)) -eq $packet[$blockPacketSize - 1]
            if ($valid) {
                [Array]::Copy($packet, 3, $image, $blockIndex * $blockSize, $blockSize)
                $accepted = $true
                $capturedBlockCount++
            }
            else {
                $control = $nak
            }
        }
        if ($terminalAckReceived) {
            Write-Output ('ECS ended the transfer after {0:N0} blocks ({1:N0} bytes).' -f $capturedBlockCount, ($capturedBlockCount * $blockSize))
            break
        }
        if (-not $accepted) { throw "Block $blockIndex failed validation after four attempts." }
        if (($blockIndex + 1) % 512 -eq 0 -or $blockIndex + 1 -eq $blockCount) {
            Write-Output ('Read {0:N0}/{1:N0} blocks ({2:P0}).' -f ($blockIndex + 1), $blockCount, (($blockIndex + 1) / $blockCount))
        }
    }
    if (-not $terminalAckReceived) {
        $port.Write([byte[]]($ack), 0, 1)
    }

    Reset-EcsBaud $port
    $finalStatus = Invoke-CardStatusQuery $port
    if ($finalStatus -ne $rawStatus) { throw 'Card status did not match after returning to 9600 baud.' }

    $captureId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
    $captureDirectory = Join-Path $OutputDirectory $captureId
    $null = New-Item -ItemType Directory -Path $captureDirectory -Force
    $capturedSize = $capturedBlockCount * $blockSize
    $capturedImage = [byte[]]::new($capturedSize)
    [Array]::Copy($image, 0, $capturedImage, 0, $capturedSize)
    $imagePath = Join-Path $captureDirectory 'card.img'
    [IO.File]::WriteAllBytes($imagePath, $capturedImage)
    $sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $imagePath).Hash.ToLowerInvariant()
    $metadata = [ordered]@{
        capturedAtUtc = [DateTime]::UtcNow.ToString('o')
        port = $PortName
        rawCardStatus = ('0x{0:X2}' -f $rawStatus)
        statusMappedCapacityBytes = $capacity
        capturedCapacityBytes = $capturedSize
        blockSize = $blockSize
        statusMappedBlockCount = $blockCount
        capturedBlockCount = $capturedBlockCount
        terminalAckReceived = $terminalAckReceived
        sha256 = $sha256
        elapsedSeconds = [Math]::Round($timer.Elapsed.TotalSeconds, 3)
        operation = 'read-only'
    }
    $metadataPath = Join-Path $captureDirectory 'capture.json'
    [IO.File]::WriteAllText($metadataPath, ($metadata | ConvertTo-Json) + [Environment]::NewLine)

    Write-Output "Capture complete: $imagePath"
    Write-Output "SHA-256: $sha256"
}
finally {
    if ($port.IsOpen) {
        Reset-EcsBaud $port
        $port.Close()
    }
    $port.Dispose()
}
