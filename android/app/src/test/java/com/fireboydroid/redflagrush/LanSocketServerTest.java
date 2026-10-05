package com.fireboydroid.redflagrush;

import org.junit.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.*;
import static org.junit.Assert.*;

public class LanSocketServerTest {
    private static SSLContext context;
    private static String fingerprint;
    private static InetAddress loopback() throws UnknownHostException { return InetAddress.getByName("127.0.0.1"); }

    @BeforeClass public static void temporaryTestIdentity() throws Exception {
        Path directory = Files.createTempDirectory("rfr-tls-test-");
        Path storeFile = directory.resolve("identity.p12");
        try {
            String executable = System.getProperty("os.name").startsWith("Windows") ? "keytool.exe" : "keytool";
            Process tool = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", executable).toString(),
                "-genkeypair", "-alias", "room", "-keyalg", "EC", "-groupname", "secp256r1", "-sigalg", "SHA256withECDSA",
                "-dname", "CN=Temporary Party Test", "-validity", "1", "-storetype", "PKCS12", "-keystore", storeFile.toString(),
                "-storepass", "temporary-test-only", "-noprompt").redirectErrorStream(true).start();
            String output = new String(tool.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            assertTrue("keytool timed out", tool.waitFor(20, TimeUnit.SECONDS));
            assertEquals(output, 0, tool.exitValue());
            KeyStore store = KeyStore.getInstance("PKCS12");
            try (InputStream input = Files.newInputStream(storeFile)) { store.load(input, "temporary-test-only".toCharArray()); }
            X509Certificate certificate = (X509Certificate) store.getCertificate("room");
            context = LanTls.serverContext((PrivateKey) store.getKey("room", "temporary-test-only".toCharArray()), certificate);
            fingerprint = LanTls.fingerprint(certificate);
        } finally { Files.deleteIfExists(storeFile); Files.deleteIfExists(directory); }
    }
    @Test public void multiplePhonesExchangeCompleteUtf8Messages() throws Exception {
        InetAddress loopback = loopback();
        try (LanSocketServer host = new LanSocketServer(loopback, context, (request, peer) -> CompletableFuture.completedFuture(request))) {
            ExecutorService players = Executors.newFixedThreadPool(8);
            try {
                List<Future<String>> votes = new ArrayList<>();
                for (int i = 0; i < 8; i++) votes.add(players.submit(() -> LanSocketServer.request(loopback, host.port(), "{\"vote\":\"green 💚\"}", fingerprint)));
                for (Future<String> vote : votes) assertEquals("{\"vote\":\"green 💚\"}", vote.get(10, TimeUnit.SECONDS));
            } finally { players.shutdownNow(); }
        }
    }
    @Test public void wrongOrMissingCertificatePinsNeverReachGameHandler() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        InetAddress loopback = loopback();
        try (LanSocketServer host = new LanSocketServer(loopback, context, (request, peer) -> { requests.incrementAndGet(); return CompletableFuture.completedFuture(request); })) {
            for (String pin : new String[]{"", "0".repeat(64), fingerprint.substring(0, 12)}) {
                try { LanSocketServer.request(loopback, host.port(), "private nickname and token", pin); fail("Invalid pin accepted"); } catch (IOException expected) {}
            }
            assertEquals(0, requests.get());
        }
    }
    @Test public void plaintextAndTls11AreRejectedBeforeGameData() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        InetAddress loopback = loopback();
        try (LanSocketServer host = new LanSocketServer(loopback, context, (request, peer) -> { requests.incrementAndGet(); return CompletableFuture.completedFuture(request); })) {
            try (Socket plain = new Socket(loopback, host.port())) {
                plain.setSoTimeout(3000);
                LanSocketServer.writeLine(plain.getOutputStream(), "{\"name\":\"never accepted\"}");
                try { int reply = plain.getInputStream().read(); assertTrue("Unexpected plaintext response", reply == -1 || reply == 21); } catch (IOException expected) {}
            }
            SSLContext legacy = SSLContext.getInstance("TLS"); legacy.init(null, null, new SecureRandom());
            try (SSLSocket socket = (SSLSocket) legacy.getSocketFactory().createSocket(loopback, host.port())) {
                socket.setEnabledProtocols(new String[]{"TLSv1.1"}); socket.setSoTimeout(3000);
                try { socket.startHandshake(); fail("TLS 1.1 accepted"); } catch (IOException expected) {}
            }
            assertEquals(0, requests.get());
        }
    }
    @Test public void manualPairingProbeChecksHostCodeWithoutSendingUserData() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        InetAddress loopback = loopback();
        try (LanSocketServer host = new LanSocketServer(loopback, context, (request, peer) -> { requests.incrementAndGet(); return CompletableFuture.completedFuture(request); })) {
            assertEquals(fingerprint, LanTls.inspect(loopback, host.port(), fingerprint.substring(0, 12), new Socket()));
            try { LanTls.inspect(loopback, host.port(), "0".repeat(12), new Socket()); fail("Wrong pairing code accepted"); } catch (IOException expected) {}
            assertEquals(0, requests.get());
        }
    }
    @Test public void oversizedAndIncompleteMessagesAreRejected() throws Exception {
        byte[] oversized = new byte[65538]; Arrays.fill(oversized, (byte) 'x'); oversized[oversized.length - 1] = '\n';
        try { LanSocketServer.readLine(new ByteArrayInputStream(oversized)); fail("Oversized message accepted"); } catch (IOException expected) {}
        try { LanSocketServer.readLine(new ByteArrayInputStream("unfinished".getBytes(StandardCharsets.UTF_8))); fail("Incomplete message accepted"); } catch (EOFException expected) {}
    }
    @Test public void remoteInternetAddressesAreNotPartyEndpoints() throws Exception {
        try { LanSocketServer.request(InetAddress.getByName("8.8.8.8"), 80, "{}", fingerprint); fail("Internet endpoint accepted"); } catch (IOException expected) { assertTrue(expected.getMessage().contains("local")); }
    }
}
