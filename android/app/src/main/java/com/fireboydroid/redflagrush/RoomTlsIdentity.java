package com.fireboydroid.redflagrush;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.math.BigInteger;
import java.security.*;
import java.security.cert.X509Certificate;
import java.security.spec.ECGenParameterSpec;
import java.util.*;
import javax.net.ssl.SSLContext;
import javax.security.auth.x500.X500Principal;

/** A temporary LAN identity, unrelated to the app's upload/signing credentials. */
final class RoomTlsIdentity implements AutoCloseable {
    private final String alias = "RedFlagRush-party-" + UUID.randomUUID();
    private final KeyStore store;
    final SSLContext context;
    final String fingerprint;

    RoomTlsIdentity() throws Exception {
        store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
            generator.initialize(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                // Conscrypt signs an already-hashed TLS transcript with NONEwithECDSA.
                // SHA-256 remains available for the temporary certificate's self-signature.
                .setDigests(KeyProperties.DIGEST_NONE, KeyProperties.DIGEST_SHA256)
                .setCertificateSubject(new X500Principal("CN=RedFlagRush Local Party"))
                .setCertificateSerialNumber(new BigInteger(128, new SecureRandom()).add(BigInteger.ONE))
                .setCertificateNotBefore(new Date(System.currentTimeMillis() - 300000))
                .setCertificateNotAfter(new Date(System.currentTimeMillis() + 86400000))
                .setUserAuthenticationRequired(false).build());
            generator.generateKeyPair();
            X509Certificate certificate = (X509Certificate) store.getCertificate(alias);
            context = LanTls.serverContext((PrivateKey) store.getKey(alias, null), certificate);
            fingerprint = LanTls.fingerprint(certificate);
        } catch (Exception error) { store.deleteEntry(alias); throw error; }
    }
    @Override public void close() { try { store.deleteEntry(alias); } catch (Exception ignored) {} }
}
