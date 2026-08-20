package me.app.prestamos;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;

public class AssetHttpServer {

    private ServerSocket server;
    private int port;
    private String htmlContent;
    private Thread thread;

    public AssetHttpServer(InputStream assetStream) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = assetStream.read(buf)) != -1) baos.write(buf, 0, n);
        assetStream.close();
        htmlContent = baos.toString("UTF-8");
    }

    public void start() throws IOException {
        server = new ServerSocket(0);
        port = server.getLocalPort();
        thread = new Thread(new Runnable() {
            public void run() {
                while (!server.isClosed()) {
                    try {
                        Socket client = server.accept();
                        handle(client);
                    } catch (Exception e) {
                        break;
                    }
                }
            }
        });
        thread.setDaemon(true);
        thread.start();
    }

    private void handle(Socket client) {
        try {
            client.setSoTimeout(5000);
            InputStream is = client.getInputStream();
            BufferedReader br = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            String requestLine = br.readLine();
            if (requestLine == null) { client.close(); return; }

            String path = "/";
            String[] parts = requestLine.split(" ");
            if (parts.length >= 2) path = parts[1];

            byte[] body;
            String contentType;
            if (path.equals("/") || path.equals("/index.html")) {
                body = htmlContent.getBytes("UTF-8");
                contentType = "text/html; charset=UTF-8";
            } else {
                String errorHtml = "<html><body><h1>404</h1></body></html>";
                body = errorHtml.getBytes("UTF-8");
                contentType = "text/html; charset=UTF-8";
            }

            String header = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: " + contentType + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-cache\r\n"
                + "Connection: close\r\n"
                + "\r\n";

            OutputStream os = client.getOutputStream();
            os.write(header.getBytes("UTF-8"));
            os.write(body);
            os.flush();
        } catch (Exception e) {
        } finally {
            try { client.close(); } catch (Exception ignored) {}
        }
    }

    public int getPort() { return port; }

    public void stop() {
        try { server.close(); } catch (Exception ignored) {}
    }
}
