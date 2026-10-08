$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
    $null = [Windows.System.UserProfile.LockScreen, Windows.System.UserProfile, ContentType = WindowsRuntime]
    $null = [Windows.Foundation.IAsyncAction, Windows.Foundation, ContentType = WindowsRuntime]

    # Convert each WinRT operation to a Task and wait before the PowerShell host exits.
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    $operation = [Windows.Storage.StorageFile]::GetFileFromPathAsync($env:FRAMEWALL_IMAGE)
    $fileTask = $asTask.MakeGenericMethod([Windows.Storage.StorageFile]).Invoke($null, @($operation))
    $file = $fileTask.GetAwaiter().GetResult()
    $action = [Windows.System.UserProfile.LockScreen]::SetImageFileAsync($file)
    # PowerShell cannot directly cast the returned COM wrapper to IAsyncAction.
    # Reflection lets the CLR marshal it, just as for IAsyncOperation above.
    $asActionTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.FullName -eq 'Windows.Foundation.IAsyncAction'
    } | Select-Object -First 1
    $actionTask = $asActionTask.Invoke($null, @($action))
    $actionTask.GetAwaiter().GetResult()
} catch {
    [Console]::Error.WriteLine($_.Exception.GetBaseException().Message)
    exit 1
}
