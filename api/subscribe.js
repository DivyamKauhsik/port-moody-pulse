export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Method not allowed"
    });
  }

  try {
    const { email } = req.body || {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        ok: false,
        message: "Please enter a valid email address."
      });
    }

    const apiKey = process.env.BREVO_API_KEY;
    const listId = Number(process.env.BREVO_LIST_ID);

    if (!apiKey || !listId) {
      return res.status(500).json({
        ok: false,
        message: "Newsletter service is not configured yet."
      });
    }

    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        email,
        listIds: [listId],
        updateEnabled: true,
        attributes: {
          SOURCE: "Port Moody Pulse Website"
        }
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Brevo API error:", data);

      return res.status(response.status).json({
        ok: false,
        message: data.message || "Something went wrong. Please try again."
      });
    }

    return res.status(200).json({
      ok: true,
      message: "You're on the list — watch for issue #1."
    });
  } catch (error) {
    console.error("Subscribe error:", error);

    return res.status(500).json({
      ok: false,
      message: "Something went wrong. Please try again."
    });
  }
}
