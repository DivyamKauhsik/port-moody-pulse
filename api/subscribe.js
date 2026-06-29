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

    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        email: email,
        listIds: [Number(process.env.BREVO_LIST_ID)],
        updateEnabled: true
      })
    });

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
