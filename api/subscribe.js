export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Method not allowed"
    });
  }
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({
        ok: false,
        message: "Please enter a valid email address."
      });
    }
    // Keep this fast: the welcome email (with the guide) goes out through the
    // Beehiiv welcome automation, so we don't send it inline here. Sending it
    // inline made subscriptions take 10+ seconds.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(
        `https://api.beehiiv.com/v2/publications/${process.env.BEEHIIV_PUBLICATION_ID}/subscriptions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.BEEHIIV_API_KEY}`
          },
          body: JSON.stringify({
            email: email.trim(),
            reactivate_existing: true,
            send_welcome_email: false
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(data);
      return res.status(400).json({
        ok: false,
        message: data.message || "Error subscribing"
      });
    }
    return res.status(200).json({
      ok: true,
      message: "You're on the list — welcome!"
    });
  } catch (error) {
    console.error(error);
    const timedOut = error && error.name === "AbortError";
    return res.status(timedOut ? 504 : 500).json({
      ok: false,
      message: timedOut
        ? "That took too long — please try again."
        : "Server error"
    });
  }
}
