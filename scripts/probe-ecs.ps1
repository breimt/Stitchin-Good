[CmdletBinding()]
param([string]$PortName = 'COM3')

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function New-CommandPacket {
    param([char]$Command)
    $prefix = [byte]0x43
    $commandByte = [byte][char]$Command
    return [byte[]]($prefix, $commandByte, [byte](($prefix + $commandByte) -band 0xFF))
}

function Read-ResponseUntilIdle {
    param(
        [System.IO.Ports.SerialPort]$Port,
        [int]$OverallTimeoutMilliseconds = 2500,
        [int]$IdleMilliseconds = 180
    )
    $bytes = [Collections.Generic.List[byte]]::new()
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $lastByteAt = -1
    while ($timer.ElapsedMilliseconds -lt $OverallTimeoutMilliseconds) {
        while ($Port.BytesToRead -gt 0) {
            $bytes.Add([byte]$Port.ReadByte())
            $lastByteAt = $timer.ElapsedMilliseconds
        }
        if ($bytes.Count -gt 0 -and $timer.ElapsedMilliseconds - $lastByteAt -ge $IdleMilliseconds) { break }
        Start-Sleep -Milliseconds 2
    }
    return $bytes.ToArray()
}

$port = [System.IO.Ports.SerialPort]::new(
    $PortName,
    9600,
    [System.IO.Ports.Parity]::None,
    8,
    [System.IO.Ports.StopBits]::One
)
$port.Handshake = [System.IO.Ports.Handshake]::None
$port.RtsEnable = $true
$port.DtrEnable = $false
$port.ReadTimeout = 250
$port.WriteTimeout = 1500

try {
    $port.Open()
    foreach ($probe in @(
        @{ Name = 'identify'; Command = [char]'I' },
        @{ Name = 'version'; Command = [char]'V' },
        @{ Name = 'device-data'; Command = [char]'D' },
        @{ Name = 'card-status'; Command = [char]'T' }
    )) {
        $port.DiscardInBuffer()
        $packet = New-CommandPacket $probe.Command
        $port.Write($packet, 0, $packet.Length)
        [byte[]]$response = @(Read-ResponseUntilIdle $port)
        [PSCustomObject]@{
            probe = $probe.Name
            commandHex = ($packet | ForEach-Object { $_.ToString('X2') }) -join ' '
            responseBytes = $response.Length
            responseHex = ($response | ForEach-Object { $_.ToString('X2') }) -join ' '
        }
    }
}
finally {
    if ($port.IsOpen) { $port.Close() }
    $port.Dispose()
}
