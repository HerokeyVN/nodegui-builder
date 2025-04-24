#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windows.h>

int main(int argc, char* argv[]) {
    char currentDir[MAX_PATH];
    char qodePath[MAX_PATH];
    char mainJsPath[MAX_PATH];
    char cmdLine[MAX_PATH * 2];
    STARTUPINFO si;
    PROCESS_INFORMATION pi;
    
    // Get current directory
    GetCurrentDirectory(MAX_PATH, currentDir);
    
    // Create paths
    sprintf(qodePath, "%s\\qode.exe", currentDir);
    sprintf(mainJsPath, "%s\\main.js",  currentDir);
    
    // Check if files exist
    if (GetFileAttributes(qodePath) == INVALID_FILE_ATTRIBUTES) {
        MessageBox(NULL, "Cannot find qode.exe", "Error", MB_OK | MB_ICONERROR);
        return 1;
    }
    
    if (GetFileAttributes(mainJsPath) == INVALID_FILE_ATTRIBUTES) {
        MessageBox(NULL, "Cannot find main.js", "Error", MB_OK | MB_ICONERROR);
        return 1;
    }
    
    // Set Qt environment variables
    char pathEnv[32768];
    sprintf(pathEnv, "PATH=%s;%%PATH%%", currentDir);
    putenv(pathEnv);
    
    char qtPluginEnv[MAX_PATH];
    sprintf(qtPluginEnv, "QT_PLUGIN_PATH=%s", currentDir);
    putenv(qtPluginEnv);
    
    char qtPlatformEnv[MAX_PATH];
    sprintf(qtPlatformEnv, "QT_QPA_PLATFORM_PLUGIN_PATH=%s\\platforms", currentDir);
    putenv(qtPlatformEnv);
    
    // Create command line
    sprintf(cmdLine, "\"%s\" \"%s\"", qodePath, mainJsPath);
    
    // Initialize startup info
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;  // Hide window
    
    // Start process
    if (!CreateProcess(
        qodePath,           // Application path
        cmdLine,            // Command line
        NULL,               // Process security attributes
        NULL,               // Thread security attributes
        FALSE,              // Inherit handles
        CREATE_NO_WINDOW,   // Creation flags
        NULL,               // Environment
        currentDir,         // Current directory
        &si,                // Startup info
        &pi                 // Process information
    )) {
        char errorMsg[256];
        sprintf(errorMsg, "Failed to start application: error code %lu", GetLastError());
        MessageBox(NULL, errorMsg, "NodeGUI Application Error", MB_OK | MB_ICONERROR);
        return 1;
    }
    
    // Close process and thread handles
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    
    return 0;
}
