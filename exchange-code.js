import dotenv from "dotenv";

dotenv.config();

const {
  ZOHO_REGION = "com",
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
} = process.env;

const REGION_DOMAINS = {
  eu: { accounts: "https://accounts.zoho.eu" },
  com: { accounts: "https://accounts.zoho.com" },
  in: { accounts: "https://accounts.zoho.in" },
  au: { accounts: "https://accounts.zoho.com.au" },
  jp: { accounts: "https://accounts.zoho.jp" },
};

const DOMAINS = REGION_DOMAINS[ZOHO_REGION] || REGION_DOMAINS.com;

async function exchangeCode() {
  console.log("🔄 Zoho Authorization Code Exchange");
  console.log("===================================");
  
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) {
    console.error("❌ Missing ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET in .env file");
    return;
  }
  
  // Get the authorization code from user input
  const authCode = process.argv[2];
  
  if (!authCode) {
    console.log("Usage: node exchange-code.js <AUTHORIZATION_CODE>");
    console.log("\nExample:");
    console.log("node exchange-code.js 1000.abc123def456...");
    return;
  }
  
  const redirectURI = "https://www.aifidi.it";
  
  console.log("Authorization code:", authCode);
  console.log("Redirect URI:", redirectURI);
  console.log("Region:", ZOHO_REGION);
  console.log("Accounts URL:", DOMAINS.accounts);
  
  try {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      redirect_uri: redirectURI,
      code: authCode,
    });

    console.log("\n🔄 Exchanging code for tokens...");
    
    const response = await fetch(`${DOMAINS.accounts}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    console.log("Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Error response:", errorText);
      return;
    }

    const data = await response.json();
    
    if (data.refresh_token) {
      console.log("\n✅ SUCCESS! Here's your refresh token:");
      console.log("=====================================");
      console.log("ZOHO_REFRESH_TOKEN=" + data.refresh_token);
      console.log("=====================================");
      
      console.log("\n📋 Other details:");
      console.log("Access token:", data.access_token ? "✓ Generated" : "✗ Missing");
      console.log("Expires in:", data.expires_in, "seconds");
      console.log("Token type:", data.token_type);
      console.log("Scope:", data.scope);
      
      console.log("\n🎯 Next steps:");
      console.log("1. Copy the ZOHO_REFRESH_TOKEN value above");
      console.log("2. Update your .env file with this new refresh token");
      console.log("3. Restart your backend server");
      console.log("4. Test your frontend - the 401 error should be gone!");
      
    } else {
      console.log("\n❌ ERROR: No refresh token in response");
      console.log("Response:", JSON.stringify(data, null, 2));
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

exchangeCode();
