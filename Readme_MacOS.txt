============================================================
SUMMER FESTIVAL 2026 - STALL POS SYSTEM (macOS SETUP)
============================================================

1. Extract this entire .ZIP folder anywhere on your Mac.
2. Open your Mac's built-in "Terminal" app (Press Cmd + Space, type "Terminal", and hit Enter).
3. Look at your Mac's processor type (Apple Icon -> About This Mac):
   - If it says Apple M1/M2/M3/M4, you will use the "arm64" file.
   - If it says Intel, you will use the "x64" file.

4. UNLOCK THE FILE (Only required the very first time):
   In the Terminal window, run these two commands one after the other. 
   (Tip: Type the command, add a space, then drag and drop the app file from Finder directly into Terminal to automatically paste its path!)

   Command 1 (Give permission to run):
   chmod +x [drag_and_drop_your_mac_app_file_here]

   Command 2 (Fix Apple Security signature):
   codesign --sign - [drag_and_drop_your_mac_app_file_here]

5. RUN THE SERVER:
   Double-click your unlocked app file to launch it! A terminal window will open running the server.

6. CONNECT THE TABLETS:
   Connect your iPads/tablets to the same Wi-Fi network as the Mac and type in the web addresses displayed on your main screen.

* Note: To safely shut down and auto-save the Excel order sheets, click the red "Quit" button on the Front Desk layout.
============================================================