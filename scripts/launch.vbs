Option Explicit
Dim shell, files, root, code, node
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(files.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = root
node = WScript.Arguments(0)
code = shell.Run(Chr(34) & node & Chr(34) & " " & Chr(34) & root & "\scripts\launch.cjs" & Chr(34), 0, True)
If code <> 0 Then MsgBox "Lucid could not prepare the latest version. Your previous build is preserved. Details: " & root & "\lucid-launch.log", vbExclamation, "Lucid"
