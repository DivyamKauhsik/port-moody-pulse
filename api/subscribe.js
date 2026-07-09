export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Method not allowed"
    });
  }
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        ok: false,
        message: "Email is required"
      });
    }
    const response = await fetch(
      `https://api.beehiiv.com/v2/publications/${process.env.BEEHIIV_PUBLICATION_ID}/subscriptions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BEEHIIV_API_KEY}`
        },
        body: JSON.stringify({
          email: email,
          reactivate_existing: true,
          send_welcome_email: true
        })
      }
    );
    const data = await response.json();
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
    return res.status(500).json({
      ok: false,
      message: "Server error"
    });
  }
}
