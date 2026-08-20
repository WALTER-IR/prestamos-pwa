package me.app.prestamos;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {

    private WebView webView;
    private Map<String, String> storage = new HashMap<String, String>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (android.os.Build.VERSION.SDK_INT >= 21) {
            Window w = getWindow();
            w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            w.setStatusBarColor(0xFF7C3AED);
            w.setNavigationBarColor(0xFF7C3AED);
        }

        webView = new WebView(this);
        setContentView(webView);

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);

        webView.addJavascriptInterface(new StorageBridge(), "AndroidStorage");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) { return true; }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("if(typeof boot==='function'){boot();}", null);
            }
        });

        try {
            String html = readAsset("www/index.html");
            webView.loadDataWithBaseURL("http://localhost/", html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            webView.loadData("<html><body><h1>Error</h1><p>" + e.getMessage() + "</p></body></html>", "text/html", "UTF-8");
        }
    }

    private String readAsset(String path) throws IOException {
        InputStream is = getAssets().open(path);
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
        is.close();
        return baos.toString("UTF-8");
    }

    public class StorageBridge {
        @JavascriptInterface
        public String getItem(String key) {
            String val = storage.get(key);
            return val != null ? val : "null";
        }

        @JavascriptInterface
        public void setItem(String key, String value) {
            storage.put(key, value);
        }

        @JavascriptInterface
        public void removeItem(String key) {
            storage.remove(key);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
