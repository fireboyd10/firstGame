package com.fireboydroid.redflagrush;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.*;

/** Bounded, one-request TCP channels; networking never runs on the UI thread. */
public final class LanSocketServer implements AutoCloseable {
    public interface Handler { CompletableFuture<String> handle(String request, String peer); }
    private final ServerSocket listener;
    private final Set<Socket> connections = ConcurrentHashMap.newKeySet();
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 12, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(24));
    private final Handler handler;
    private volatile boolean running = true;
    public LanSocketServer(InetAddress address, Handler handler) throws IOException {
        this.handler = handler;
        listener = new ServerSocket(); listener.setReuseAddress(true);
        listener.bind(new InetSocketAddress(address, 0), 16);
        Thread acceptor = new Thread(this::accept, "RedFlagRush-party-listener");
        acceptor.setDaemon(true); acceptor.start();
    }
    public int port() { return listener.getLocalPort(); }
    private void accept() {
        while (running) {
            try {
                Socket socket = listener.accept();
                socket.setSoTimeout(8000); socket.setTcpNoDelay(true);
                connections.add(socket);
                try { workers.execute(() -> serve(socket)); }
                catch (RejectedExecutionException error) { connections.remove(socket); socket.close(); }
            } catch (IOException error) { if (!running) return; }
        }
    }
    private void serve(Socket socket) {
        try (Socket connection = socket) {
            String request = readLine(connection.getInputStream());
            String response = handler.handle(request, connection.getInetAddress().getHostAddress()).get(7, TimeUnit.SECONDS);
            writeLine(connection.getOutputStream(), response);
        } catch (Exception ignored) { /* A timed-out/disconnected peer can retry safely. */ }
        finally { connections.remove(socket); }
    }
    static String readLine(InputStream input) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        for (int value; (value = input.read()) != -1;) {
            if (value == '\n') return bytes.toString(StandardCharsets.UTF_8.name());
            if (bytes.size() >= 65536) throw new IOException("Party message is too large.");
            bytes.write(value);
        }
        throw new EOFException("Party connection closed.");
    }
    static void writeLine(OutputStream output, String value) throws IOException {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 65536 || value.indexOf('\n') >= 0) throw new IOException("Invalid party message.");
        output.write(bytes); output.write('\n'); output.flush();
    }
    public static String request(InetAddress address, int port, String data) throws IOException {
        return request(address, port, data, new Socket());
    }
    public static String request(InetAddress address, int port, String data, Socket wifiSocket) throws IOException {
        try (Socket socket = wifiSocket) {
            if (!(address.isSiteLocalAddress() || address.isLinkLocalAddress() || address.isLoopbackAddress())) throw new IOException("Use a local Wi-Fi address.");
            if (port < 1 || port > 65535) throw new IOException("Invalid party port.");
            socket.connect(new InetSocketAddress(address, port), 5000); socket.setSoTimeout(8000); socket.setTcpNoDelay(true);
            writeLine(socket.getOutputStream(), data);
            return readLine(socket.getInputStream());
        }
    }
    @Override public void close() throws IOException {
        running = false; listener.close();
        for (Socket socket : connections) { try { socket.close(); } catch (IOException ignored) {} }
        connections.clear(); workers.shutdownNow();
    }
}
