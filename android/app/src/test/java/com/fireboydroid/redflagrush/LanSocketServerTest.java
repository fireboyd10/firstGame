package com.fireboydroid.redflagrush;

import org.junit.Test;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.Assert.*;

public class LanSocketServerTest {
    @Test public void multiplePhonesExchangeCompleteUtf8Messages() throws Exception {
        InetAddress loopback = InetAddress.getByName("127.0.0.1");
        try (LanSocketServer host = new LanSocketServer(loopback, (request, peer) -> CompletableFuture.completedFuture(request))) {
            ExecutorService players = Executors.newFixedThreadPool(8);
            try {
                List<Future<String>> votes = new ArrayList<>();
                for (int i = 0; i < 8; i++) votes.add(players.submit(() -> LanSocketServer.request(loopback, host.port(), "{\"vote\":\"green 💚\"}")));
                for (Future<String> vote : votes) assertEquals("{\"vote\":\"green 💚\"}", vote.get(5, TimeUnit.SECONDS));
            } finally { players.shutdownNow(); }
        }
    }
    @Test public void oversizedAndIncompleteMessagesAreRejected() throws Exception {
        byte[] oversized = new byte[65538]; Arrays.fill(oversized, (byte) 'x'); oversized[oversized.length - 1] = '\n';
        try { LanSocketServer.readLine(new ByteArrayInputStream(oversized)); fail("Oversized message accepted"); } catch (IOException expected) {}
        try { LanSocketServer.readLine(new ByteArrayInputStream("unfinished".getBytes(StandardCharsets.UTF_8))); fail("Incomplete message accepted"); } catch (EOFException expected) {}
    }
    @Test public void remoteInternetAddressesAreNotPartyEndpoints() throws Exception {
        try { LanSocketServer.request(InetAddress.getByName("8.8.8.8"), 80, "{}"); fail("Internet endpoint accepted"); } catch (IOException expected) { assertTrue(expected.getMessage().contains("local")); }
    }
}
