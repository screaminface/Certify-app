package com.certify.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowInsets;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Enable fullscreen edge-to-edge display
        setupFullscreen();
    }
    
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            setupFullscreen();
        }
    }
    
    private void setupFullscreen() {
        Window window = getWindow();
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+ (API 30+) - Use WindowInsetsController
            window.setDecorFitsSystemWindows(false);
            
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                // Hide both status bar and navigation bar
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                
                // Set immersive sticky mode behavior
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            // Android 10 and below - Use legacy flags
            WindowCompat.setDecorFitsSystemWindows(window, false);
            
            WindowInsetsControllerCompat controllerCompat = 
                WindowCompat.getInsetsController(window, window.getDecorView());
            
            if (controllerCompat != null) {
                // Hide both status bar and navigation bar
                controllerCompat.hide(
                    WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars()
                );
                
                // Set immersive sticky mode behavior
                controllerCompat.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
            
            // Fallback for older devices
            View decorView = window.getDecorView();
            int uiOptions = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN;
            decorView.setSystemUiVisibility(uiOptions);
        }
    }
}
