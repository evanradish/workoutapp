package com.evan.workouts;

import android.app.Activity;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.util.Locale;

/** Shows the workout web app full screen on Google TV, with spoken cues and the screen kept on. */
public class MainActivity extends Activity {
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) { tts.setLanguage(Locale.US); ttsReady = true; }
        });

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // keeps workout history in localStorage
        s.setMediaPlaybackRequiresUserGesture(false); // lets the countdown beeps play
        s.setAllowFileAccess(true);
        web.setBackgroundColor(0xFF0F1115);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Speech(), "AndroidTTS");
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);
        web.requestFocus(View.FOCUS_DOWN);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/www/index.html");
    }

    /** Called from the web app to say the next exercise out loud. */
    private class Speech {
        @JavascriptInterface
        public void speak(String text) {
            if (ttsReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "cue");
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // The remote's Back button goes back inside the app (and asks before ending a workout)
        // instead of closing it. On the main screen it exits as usual.
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP) {
                web.evaluateJavascript(
                    "(function(){var h=location.hash||'#/';var p=document.getElementById('player');" +
                    "if((h==='#/'||h==='')&&p.hidden)return 'exit';" +
                    "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return 'ok';})()",
                    result -> { if ("\"exit\"".equals(result)) finish(); });
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
