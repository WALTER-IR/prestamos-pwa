package me.app.prestamos;

import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.Date;

public class App extends Application {
    private static App instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;

        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread t, Throwable e) {
                try {
                    File dir = getExternalFilesDir(null);
                    if (dir != null && !dir.exists()) dir.mkdirs();
                    File f = new File(dir, "errores.txt");
                    PrintWriter pw = new PrintWriter(new FileWriter(f, true));
                    pw.println("[" + new Date() + "] " + e.toString());
                    e.printStackTrace(pw);
                    pw.close();
                } catch (Exception ignored) {}
                System.exit(1);
            }
        });
    }
}
