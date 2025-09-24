import dotenv from "dotenv";

dotenv.config();

const {
  ZOHO_REGION = "com",
  ZOHO_CLIENT_ID,
} = process.env;

const REGION_DOMAINS = {
  eu: { accounts: "https://accounts.zoho.eu" },
  com: { accounts: "https://accounts.zoho.com" },
  in: { accounts: "https://accounts.zoho.in" },
  au: { accounts: "https://accounts.zoho.com.au" },
  jp: { accounts: "https://accounts.zoho.jp" },
};

const DOMAINS = REGION_DOMAINS[ZOHO_REGION] || REGION_DOMAINS.com;

function generateAuthURL() {
  console.log("🔗 Zoho OAuth Authorization URL Generator");
  console.log("==========================================");
  
  if (!ZOHO_CLIENT_ID) {
    console.error("❌ ZOHO_CLIENT_ID not found in .env file");
    return;
  }
  
  // Test different redirect URIs
  const redirectURIs = [
    "https://www.aifidi.it",
    "http://localhost:3000",
    "https://aifidi-backend-production.up.railway.app",
    "https://aifidi-backend-production.up.railway.app/",
    "http://localhost:3000/",
    "https://www.aifidi.it/",
    "urn:ietf:wg:oauth:2.0:oob"
  ];
  
  console.log("🔗 Testing different redirect URIs...");
  console.log("=====================================");
  
  redirectURIs.forEach((redirectURI, index) => {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: ZOHO_CLIENT_ID,
      scope: "ZohoCRM.modules.ALL",
      redirect_uri: redirectURI,
      access_type: "offline",
      prompt: "consent"
    });
    
    const authURL = `${DOMAINS.accounts}/oauth/v2/auth?${params.toString()}`;
    
    console.log(`\n${index + 1}. Redirect URI: ${redirectURI}`);
    console.log("   URL:", authURL);
  });
  
  console.log("\n📋 Instructions:");
  console.log("1. Try each URL above in your browser");
  console.log("2. The one that works (doesn't show redirect URI error) is correct");
  console.log("3. Use that redirect URI for the token exchange");
  
  return;
  
  const params = new URLSearchParams({
    response_type: "code",
    client_id: ZOHO_CLIENT_ID,
    scope: "ZohoCRM.modules.ALL",
    redirect_uri: redirectURI,
    access_type: "offline",
    prompt: "consent"
  });
  
  const authURL = `${DOMAINS.accounts}/oauth/v2/auth?${params.toString()}`;
  
  console.log("✅ Generated Authorization URL:");
  console.log("================================");
  console.log(authURL);
  console.log("================================");
  
  console.log("\n📋 Instructions:");
  console.log("1. Copy the URL above");
  console.log("2. Open it in your browser");
  console.log("3. Log in to your Zoho account");
  console.log("4. Grant permissions for ZohoCRM.modules.ALL");
  console.log("5. You'll be redirected to:", redirectURI);
  console.log("6. Copy the 'code' parameter from the redirect URL");
  console.log("7. Use that code to exchange for a refresh token");
  
  console.log("\n🔧 If the redirect URI doesn't match:");
  console.log("Update the redirectURI variable in this script to match what you set in Zoho API Console");
  console.log("Common options:");
  console.log("- https://www.aifidi.it");
  console.log("- http://localhost:3000");
  console.log("- https://aifidi-backend-production.up.railway.app");
  
  console.log("\n⚠️  Important:");
  console.log("- The authorization code expires in ~2 minutes");
  console.log("- Exchange it immediately for a refresh token");
  console.log("- Make sure your Zoho app has the correct redirect URI configured");
}

generateAuthURL();
