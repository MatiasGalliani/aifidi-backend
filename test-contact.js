import dotenv from "dotenv";

dotenv.config();

const {
  PORT = 3000,
  NODE_ENV = "development",
} = process.env;

const BASE_URL = `http://localhost:${PORT}`;

async function testContactCreation() {
  console.log("🧪 Testing Zoho Contact Creation");
  console.log("=================================");
  console.log(`Testing against: ${BASE_URL}`);
  console.log();

  const testData = {
    email: "test2@example.com",
    attributes: {
      first_name: "John",
      last_name: "Doe",
      company: "Test Company",
      phone: "+1234567890",
      city: "New York",
      state: "NY",
      country: "USA",
      message: "This is a test contact from the backend"
    }
  };

  try {
    console.log("📤 Sending test data:", JSON.stringify(testData, null, 2));
    console.log();

    const response = await fetch(`${BASE_URL}/api/zoho/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testData),
    });

    console.log("📥 Response status:", response.status);
    console.log("📥 Response headers:", Object.fromEntries(response.headers.entries()));

    const responseData = await response.json();
    console.log("📥 Response data:", JSON.stringify(responseData, null, 2));

    if (response.ok) {
      console.log("\n✅ SUCCESS! Contact created/updated in Zoho CRM");
      console.log("Action:", responseData.action);
      console.log("Zoho details:", responseData.zoho);
    } else {
      console.log("\n❌ ERROR! Contact creation failed");
      console.log("Error:", responseData.error);
      console.log("Details:", responseData.detail);
    }

  } catch (error) {
    console.error("\n❌ Network/Request Error:", error.message);
  }
}

// Run the test
testContactCreation();
