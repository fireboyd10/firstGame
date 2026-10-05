package com.fireboydroid.redflagrush;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhonePartyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
