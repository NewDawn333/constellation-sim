set projectDir to POSIX path of ((path to me as text) & "::")
set launchScript to projectDir & "launch-dev.sh"
tell application "Terminal"
	activate
	do script "bash " & quoted form of launchScript
end tell
