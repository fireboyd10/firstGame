package com.fireboydroid.redflagrush;

import android.content.Context;
import android.net.*;
import android.net.nsd.*;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "PhoneParty")
public class PhonePartyPlugin extends Plugin {
    private static final String TYPE = "_redflagrush._tcp.";
    private final ExecutorService io = Executors.newFixedThreadPool(4);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, CompletableFuture<String>> pending = new ConcurrentHashMap<>();
    private LanSocketServer server;
    private RoomTlsIdentity identity;
    private NsdManager.RegistrationListener registration;
    private NsdManager.DiscoveryListener discovery;
    private Runnable discoveryTimeout;
    private PluginCall discovering;
    private boolean resolving;
    private final Queue<NsdServiceInfo> found = new ArrayDeque<>();
    private int searchGeneration;
    private NsdManager nsd() { return (NsdManager) getContext().getSystemService(Context.NSD_SERVICE); }

    private Network wifiNetwork() {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        for (Network network : manager.getAllNetworks()) {
            NetworkCapabilities caps = manager.getNetworkCapabilities(network);
            if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && !caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return network;
        }
        throw new IllegalStateException("Connect this phone to the same Wi-Fi as your friends, then try again.");
    }
    private InetAddress wifiAddress() throws Exception {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        LinkProperties links = manager.getLinkProperties(wifiNetwork());
        if (links != null) for (LinkAddress link : links.getLinkAddresses()) {
            InetAddress address = link.getAddress();
            if (address instanceof Inet4Address && (address.isSiteLocalAddress() || address.isLinkLocalAddress())) return address;
        }
        throw new IllegalStateException("This Wi-Fi has no local IPv4 address. Reconnect Wi-Fi and try again.");
    }
    @PluginMethod public void startHost(PluginCall call) {
        String code = call.getString("code", "");
        if (!code.matches("[A-Z2-9]{6}")) { call.reject("Invalid room code."); return; }
        io.execute(() -> {
            try {
                stopServer();
                InetAddress address = wifiAddress();
                identity = new RoomTlsIdentity();
                final String fingerprint = identity.fingerprint;
                server = new LanSocketServer(address, identity.context, (text, peer) -> {
                    CompletableFuture<String> result = new CompletableFuture<>();
                    String id = UUID.randomUUID().toString();
                    try {
                        JSONObject raw = new JSONObject(text);
                        String path = raw.optString("path");
                        String method = raw.optString("method");
                        if (!(method.equals("GET") || method.equals("POST")) || !path.startsWith("/api/")) throw new Exception("Invalid request.");
                        JSObject event = JSObject.fromJSONObject(raw); event.put("id", id); event.put("peer", peer);
                        pending.put(id, result);
                        main.post(() -> notifyListeners("request", event));
                        main.postDelayed(() -> { CompletableFuture<String> waiting = pending.remove(id); if (waiting != null) waiting.completeExceptionally(new TimeoutException()); }, 7500);
                    } catch (Exception error) { result.completeExceptionally(error); }
                    return result;
                });
                final int port = server.port();
                main.post(() -> {
                    AtomicBoolean completed = new AtomicBoolean();
                    Runnable timeout = () -> {
                        if (!completed.compareAndSet(false, true)) return;
                        io.execute(() -> stopServer());
                        call.reject("Could not share the room on Wi-Fi. Reconnect Wi-Fi and try again.");
                    };
                    NsdServiceInfo info = new NsdServiceInfo(); info.setServiceName("RFR-" + code); info.setServiceType(TYPE); info.setPort(port);
                    info.setAttribute("code", code); info.setAttribute("version", "3"); info.setAttribute("fingerprint", fingerprint);
                    registration = new NsdManager.RegistrationListener() {
                        public void onServiceRegistered(NsdServiceInfo service) {
                            main.post(() -> {
                                if (!completed.compareAndSet(false, true)) return;
                                main.removeCallbacks(timeout);
                                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                                JSObject endpoint = new JSObject(); endpoint.put("host", address.getHostAddress()); endpoint.put("port", port); endpoint.put("fingerprint", fingerprint); call.resolve(endpoint);
                            });
                        }
                        public void onRegistrationFailed(NsdServiceInfo service, int error) { main.post(timeout); }
                        public void onServiceUnregistered(NsdServiceInfo service) {}
                        public void onUnregistrationFailed(NsdServiceInfo service, int error) {}
                    };
                    main.postDelayed(timeout, 8000);
                    try { nsd().registerService(info, NsdManager.PROTOCOL_DNS_SD, registration); }
                    catch (Exception error) { timeout.run(); }
                });
            } catch (Exception error) { stopServer(); call.reject(error.getMessage()); }
        });
    }
    private synchronized void stopServer() {
        if (server != null) { try { server.close(); } catch (Exception ignored) {} server = null; }
        if (identity != null) { identity.close(); identity = null; }
        for (CompletableFuture<String> reply : pending.values()) reply.completeExceptionally(new IllegalStateException("Room closed."));
        pending.clear();
        NsdManager.RegistrationListener previous = registration; registration = null;
        main.post(() -> {
            if (previous != null) { try { nsd().unregisterService(previous); } catch (Exception ignored) {} }
            if (getActivity() != null) getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }
    @PluginMethod public void stopHost(PluginCall call) { io.execute(() -> { stopServer(); call.resolve(); }); }
    @PluginMethod public void sha256(PluginCall call) {
        String value = call.getString("value", "");
        if (value.length() > 64) { call.reject("Input too long."); return; }
        try {
            byte[] bytes = java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder digest = new StringBuilder(64);
            for (byte item : bytes) digest.append(String.format(Locale.ROOT, "%02x", item & 255));
            JSObject result = new JSObject(); result.put("digest", digest.toString()); call.resolve(result);
        } catch (Exception error) { call.reject("Cannot verify review access."); }
    }
    @PluginMethod public void reply(PluginCall call) {
        CompletableFuture<String> response = pending.remove(call.getString("id", ""));
        if (response != null) {
            JSObject value = new JSObject(); value.put("status", call.getInt("status", 500)); value.put("data", call.getObject("data", new JSObject()));
            response.complete(value.toString());
        }
        call.resolve();
    }
    @PluginMethod public void request(PluginCall call) {
        String host = call.getString("host", ""); int port = call.getInt("port", 0);
        if (!host.matches("[0-9a-fA-F:.%]+")) { call.reject("Use a local Wi-Fi address."); return; }
        io.execute(() -> {
            try {
                JSONObject request = new JSONObject(); request.put("method", call.getString("method", "GET")); request.put("path", call.getString("path", ""));
                request.put("token", call.getString("token", "")); request.put("body", call.getObject("body", new JSObject()));
                Socket socket = wifiNetwork().getSocketFactory().createSocket();
                call.resolve(JSObject.fromJSONObject(new JSONObject(LanSocketServer.request(InetAddress.getByName(host), port, request.toString(), call.getString("fingerprint", ""), socket))));
            } catch (Exception error) { call.reject("Secure connection failed. Check Wi-Fi and the host's security code. Rejoin if the host restarted the room."); }
        });
    }
    @PluginMethod public void inspectHost(PluginCall call) {
        String host = call.getString("host", ""); int port = call.getInt("port", 0);
        String securityCode = call.getString("securityCode", "");
        if (!host.matches("[0-9a-fA-F:.%]+") || !securityCode.matches("[0-9a-f]{12}")) { call.reject("Enter the host's connection address and security code."); return; }
        io.execute(() -> {
            try {
                String pin = LanTls.inspect(InetAddress.getByName(host), port, securityCode, wifiNetwork().getSocketFactory().createSocket());
                JSObject endpoint = new JSObject(); endpoint.put("host", host); endpoint.put("port", port); endpoint.put("fingerprint", pin); call.resolve(endpoint);
            } catch (Exception error) { call.reject("Cannot verify this host. Check the security code on the host phone and use the same Wi-Fi."); }
        });
    }
    @PluginMethod public void discover(PluginCall call) {
        String code = call.getString("code", "");
        if (!code.matches("[A-Z2-9]{6}")) { call.reject("Enter the six-character room code."); return; }
        main.post(() -> {
            if (discovering != null) { call.reject("Already looking for a room. Try again shortly."); return; }
            discovering = call; found.clear(); resolving = false;
            final int generation = ++searchGeneration;
            discovery = new NsdManager.DiscoveryListener() {
                public void onDiscoveryStarted(String type) {}
                public void onDiscoveryStopped(String type) {}
                public void onStartDiscoveryFailed(String type, int error) { main.post(() -> { if (generation == searchGeneration) finishDiscovery(null, "Could not search Wi-Fi. Check local network access."); }); }
                public void onStopDiscoveryFailed(String type, int error) {}
                public void onServiceLost(NsdServiceInfo service) {}
                public void onServiceFound(NsdServiceInfo service) { main.post(() -> { if (generation == searchGeneration && service.getServiceName().startsWith("RFR-" + code)) { found.add(service); resolveNext(); } }); }
            };
            discoveryTimeout = () -> finishDiscovery(null, "Room not found. Keep the host game open, check the code and use the same Wi-Fi. Guest Wi-Fi may block connections between phones.");
            main.postDelayed(discoveryTimeout, 7000);
            try {
                Network network = wifiNetwork();
                if (Build.VERSION.SDK_INT >= 33) nsd().discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, network, getContext().getMainExecutor(), discovery);
                else nsd().discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, discovery);
            }
            catch (Exception error) { finishDiscovery(null, "Local network access is unavailable. Check the app's network permission."); }
        });
    }
    @SuppressWarnings("deprecation") private void resolveNext() {
        if (resolving || discovering == null || found.isEmpty()) return;
        resolving = true;
        final int generation = searchGeneration;
        nsd().resolveService(found.remove(), new NsdManager.ResolveListener() {
            public void onResolveFailed(NsdServiceInfo service, int error) { main.post(() -> { if (generation != searchGeneration) return; resolving = false; resolveNext(); }); }
            public void onServiceResolved(NsdServiceInfo service) { main.post(() -> {
                if (generation != searchGeneration || discovering == null) return;
                resolving = false;
                InetAddress address = service.getHost();
                byte[] pinBytes = service.getAttributes().get("fingerprint");
                byte[] versionBytes = service.getAttributes().get("version");
                String pin = pinBytes == null ? "" : new String(pinBytes, StandardCharsets.US_ASCII);
                String version = versionBytes == null ? "" : new String(versionBytes, StandardCharsets.US_ASCII);
                if (!version.equals("3") || !pin.matches("[0-9a-f]{64}")) { resolveNext(); return; }
                if (Build.VERSION.SDK_INT >= 34) for (InetAddress candidate : service.getHostAddresses()) if (candidate instanceof Inet4Address) { address = candidate; break; }
                if (address != null && (address.isSiteLocalAddress() || address.isLinkLocalAddress())) {
                    JSObject endpoint = new JSObject(); endpoint.put("host", address.getHostAddress()); endpoint.put("port", service.getPort()); endpoint.put("fingerprint", pin); finishDiscovery(endpoint, null);
                } else resolveNext();
            }); }
        });
    }
    private void finishDiscovery(JSObject endpoint, String error) {
        PluginCall call = discovering; discovering = null;
        searchGeneration++;
        if (discoveryTimeout != null) main.removeCallbacks(discoveryTimeout);
        if (discovery != null) { try { nsd().stopServiceDiscovery(discovery); } catch (Exception ignored) {} discovery = null; }
        found.clear();
        if (call != null) { if (endpoint != null) call.resolve(endpoint); else call.reject(error); }
    }
    @Override protected void handleOnDestroy() { main.post(() -> finishDiscovery(null, "Game closed.")); stopServer(); io.shutdownNow(); }
}
