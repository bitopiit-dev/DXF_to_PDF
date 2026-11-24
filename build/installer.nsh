; DXF to PDF installer additions (electron-builder picks this file up automatically).
; Adds right-click "Convert to PDF" for .dxf files and "Convert DXF drawings to PDF" for folders,
; for the current user only. Conversions use the settings last used in the app and end with a notification.

!define DXF2PDF_FILE_KEY "Software\Classes\SystemFileAssociations\.dxf\shell\DXFtoPDF.Convert"
!define DXF2PDF_DIR_KEY "Software\Classes\Directory\shell\DXFtoPDF.ConvertAll"

!macro customInstall
  WriteRegStr HKCU "${DXF2PDF_FILE_KEY}" "" "Convert to PDF"
  WriteRegStr HKCU "${DXF2PDF_FILE_KEY}" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "${DXF2PDF_FILE_KEY}" "MultiSelectModel" "Player"
  WriteRegStr HKCU "${DXF2PDF_FILE_KEY}\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --convert "%1" --last-used --notify'
  WriteRegStr HKCU "${DXF2PDF_DIR_KEY}" "" "Convert DXF drawings to PDF"
  WriteRegStr HKCU "${DXF2PDF_DIR_KEY}" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "${DXF2PDF_DIR_KEY}\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --convert "%1" --last-used --notify'
  ; tell Explorer the menus changed
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "${DXF2PDF_FILE_KEY}"
  DeleteRegKey HKCU "${DXF2PDF_DIR_KEY}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
