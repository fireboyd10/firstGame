package com.fireboydroid.redflagrush;

import java.io.*;
import java.net.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.concurrent.*;

/** Uses the production Android transport with a temporary, CI-only TLS identity. */
public final class PartyTlsInterop {
    public static void main(String[] args) throws Exception {
        InetAddress address = InetAddress.getByName("127.0.0.1");
        if (args[0].equals("client")) {
            String reply = LanSocketServer.request(address, Integer.parseInt(args[1]), "private nickname and vote", args[2]);
            if (!reply.equals("private nickname and vote")) throw new AssertionError("Unexpected TLS reply");
            System.out.println("PASS: Android TLS client to iOS TLS server"); return;
        }
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream input = new FileInputStream(args[1])) { store.load(input, "temporary-test-only".toCharArray()); }
        X509Certificate certificate = (X509Certificate) store.getCertificate("room");
        LanSocketServer server = new LanSocketServer(address, LanTls.serverContext((PrivateKey) store.getKey("room", "temporary-test-only".toCharArray()), certificate),
            (request, peer) -> CompletableFuture.completedFuture(request));
        Runtime.getRuntime().addShutdownHook(new Thread(() -> { try { server.close(); } catch (IOException ignored) {} }));
        System.out.println(server.port() + " " + LanTls.fingerprint(certificate)); System.out.flush();
        new CountDownLatch(1).await();
    }
}
