package com.fireboydroid.redflagrush;

import java.io.IOException;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.cert.*;
import java.util.*;
import javax.net.ssl.*;

/** TLS 1.2+ with an out-of-band verified, per-room certificate pin. No plaintext fallback. */
final class LanTls {
    private LanTls() {}

    static String fingerprint(X509Certificate certificate) throws GeneralSecurityException {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded());
        StringBuilder result = new StringBuilder(64);
        for (byte value : digest) result.append(String.format(Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }

    static SSLContext serverContext(PrivateKey key, X509Certificate certificate) throws GeneralSecurityException {
        X509ExtendedKeyManager manager = new X509ExtendedKeyManager() {
            public String[] getClientAliases(String type, Principal[] issuers) { return null; }
            public String chooseClientAlias(String[] types, Principal[] issuers, Socket socket) { return null; }
            public String[] getServerAliases(String type, Principal[] issuers) { return "EC".equals(type) ? new String[]{"room"} : null; }
            public String chooseServerAlias(String type, Principal[] issuers, Socket socket) { return "EC".equals(type) ? "room" : null; }
            public String chooseEngineServerAlias(String type, Principal[] issuers, SSLEngine engine) { return "EC".equals(type) ? "room" : null; }
            public X509Certificate[] getCertificateChain(String alias) { return "room".equals(alias) ? new X509Certificate[]{certificate} : null; }
            public PrivateKey getPrivateKey(String alias) { return "room".equals(alias) ? key : null; }
        };
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(new KeyManager[]{manager}, null, new SecureRandom());
        return context;
    }

    private static SSLContext clientContext(String pin, boolean pairingProbe) throws IOException {
        if (pin == null || !pin.matches(pairingProbe ? "[0-9a-f]{12}" : "[0-9a-f]{64}")) throw new IOException("Missing verified room security code.");
        try {
            X509TrustManager verifier = new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                public void checkClientTrusted(X509Certificate[] chain, String auth) throws CertificateException { throw new CertificateException("Client identities are not used."); }
                public void checkServerTrusted(X509Certificate[] chain, String auth) throws CertificateException {
                    if (chain == null || chain.length == 0) throw new CertificateException("Missing host certificate.");
                    chain[0].checkValidity();
                    try {
                        String actual = fingerprint(chain[0]);
                        if (pairingProbe) actual = actual.substring(0, 12);
                        if (!MessageDigest.isEqual(actual.getBytes(StandardCharsets.US_ASCII), pin.getBytes(StandardCharsets.US_ASCII))) throw new CertificateException("Room identity changed. Check the security code on the host phone.");
                    } catch (GeneralSecurityException error) { throw new CertificateException("Room identity could not be verified.", error); }
                }
            };
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, new TrustManager[]{verifier}, new SecureRandom());
            return context;
        } catch (GeneralSecurityException error) { throw new IOException("TLS is unavailable.", error); }
    }

    static void configure(SSLServerSocket socket) {
        socket.setEnabledProtocols(protocols(socket.getSupportedProtocols()));
        socket.setEnabledCipherSuites(ciphers(socket.getSupportedCipherSuites()));
        SSLParameters parameters = socket.getSSLParameters(); applicationProtocol(parameters); socket.setSSLParameters(parameters);
    }
    private static void configure(SSLSocket socket) {
        socket.setEnabledProtocols(protocols(socket.getSupportedProtocols()));
        socket.setEnabledCipherSuites(ciphers(socket.getSupportedCipherSuites()));
        SSLParameters parameters = socket.getSSLParameters(); applicationProtocol(parameters); socket.setSSLParameters(parameters);
    }
    private static void applicationProtocol(SSLParameters parameters) {
        // ALPN is available on newer phones/JDKs. Older Android still uses pinned TLS 1.2.
        try { SSLParameters.class.getMethod("setApplicationProtocols", String[].class).invoke(parameters, (Object) new String[]{"rfr-party/3"}); }
        catch (ReflectiveOperationException ignored) {}
    }
    private static String[] protocols(String[] supported) {
        return Arrays.stream(supported).filter(value -> value.equals("TLSv1.2") || value.equals("TLSv1.3")).toArray(String[]::new);
    }
    private static String[] ciphers(String[] supported) {
        return Arrays.stream(supported).filter(value -> value.startsWith("TLS_AES_") || value.startsWith("TLS_CHACHA20_") || value.startsWith("TLS_ECDHE_ECDSA_") && (value.contains("_GCM_") || value.contains("CHACHA20"))).toArray(String[]::new);
    }

    static SSLSocket connect(InetAddress address, int port, String pin, Socket wifiSocket, boolean pairingProbe) throws IOException {
        try {
            if (!(address.isSiteLocalAddress() || address.isLinkLocalAddress() || address.isLoopbackAddress())) throw new IOException("Use a local Wi-Fi address.");
            if (port < 1 || port > 65535) throw new IOException("Invalid party port.");
            SSLContext context = clientContext(pin, pairingProbe);
            wifiSocket.connect(new InetSocketAddress(address, port), 5000);
            wifiSocket.setSoTimeout(8000); wifiSocket.setTcpNoDelay(true);
            SSLSocket tls = (SSLSocket) context.getSocketFactory().createSocket(wifiSocket, address.getHostAddress(), port, true);
            configure(tls);
            try { tls.startHandshake(); return tls; }
            catch (IOException error) { tls.close(); throw error; }
        } catch (IOException error) { wifiSocket.close(); throw error; }
    }

    /** Certificate-only handshake: a manually entered code must match before any game data is sent. */
    static String inspect(InetAddress address, int port, String securityCode, Socket wifiSocket) throws IOException {
        try (SSLSocket tls = connect(address, port, securityCode, wifiSocket, true)) {
            return fingerprint((X509Certificate) tls.getSession().getPeerCertificates()[0]);
        } catch (GeneralSecurityException error) { throw new IOException("Invalid host identity.", error); }
    }
}
