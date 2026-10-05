package com.fireboydroid.redflagrush;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

/** Runs on Android's real TLS provider and AndroidKeyStore, without a desktop TLS proxy. */
@RunWith(AndroidJUnit4.class)
public class PartyTlsInstrumentedTest {
    @Test public void realAndroidIdentitySupportsEightEncryptedPeersAndRejectsImpersonation() throws Exception {
        InetAddress local = InetAddress.getByName("127.0.0.1");
        AtomicInteger handled = new AtomicInteger();
        List<Exception> failures = new CopyOnWriteArrayList<>();
        try (RoomTlsIdentity identity = new RoomTlsIdentity();
             LanSocketServer server = new LanSocketServer(local, identity.context, new LanSocketServer.Handler() {
                 public CompletableFuture<String> handle(String request, String peer) { handled.incrementAndGet(); return CompletableFuture.completedFuture(request); }
                 public void onFailure(Exception error) { failures.add(error); }
             })) {
            assertTrue(identity.fingerprint.matches("[0-9a-f]{64}"));
            ExecutorService players = Executors.newFixedThreadPool(8);
            try {
                List<Future<String>> responses = new ArrayList<>();
                for (int i = 0; i < 8; i++) responses.add(players.submit(() -> LanSocketServer.request(local, server.port(), "{\"vote\":\"green 💚\"}", identity.fingerprint)));
                Exception firstError = null;
                for (Future<String> response : responses) {
                    try { assertEquals("{\"vote\":\"green 💚\"}", response.get(15, TimeUnit.SECONDS)); }
                    catch (Exception error) { if (firstError == null) firstError = error; }
                }
                if (firstError != null) { for (Exception serverError : failures) firstError.addSuppressed(serverError); throw firstError; }
            } finally { players.shutdownNow(); }
            assertEquals(8, handled.get());
            String wrongPin = new String(new char[64]).replace('\0', '0');
            for (String pin : new String[]{"", wrongPin, identity.fingerprint.substring(0, 12)}) {
                try { LanSocketServer.request(local, server.port(), "private nickname", pin); fail("Invalid pin accepted"); } catch (IOException expected) {}
            }
            assertEquals(identity.fingerprint, LanTls.inspect(local, server.port(), identity.fingerprint.substring(0, 12), new Socket()));
            try { LanTls.inspect(local, server.port(), wrongPin.substring(0, 12), new Socket()); fail("Wrong pairing code accepted"); } catch (IOException expected) {}
            try (Socket plain = new Socket(local, server.port())) {
                plain.setSoTimeout(3000); LanSocketServer.writeLine(plain.getOutputStream(), "plaintext nickname must not be accepted");
                try { plain.getInputStream().read(); } catch (IOException expected) {}
            }
            assertEquals("Wrong pins, pairing probes and plaintext must never reach the game", 8, handled.get());
        }
    }
}
