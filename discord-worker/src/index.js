const MEMBER_ROLE_ID = "1553420244847173753";
const UNVERIFIED_ROLE_ID = "1553427895807119420";
const GUILD_ID = "1552958510671724605";

const DISCORD_API = "https://discord.com/api/v10";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ============================================================
    // NORMAL BROWSER REQUEST
    // ============================================================
    if (request.method !== "POST") {
      return new Response("DSA Community Bot Worker is running!");
    }

    // ============================================================
    // DISCORD SIGNATURE VERIFICATION
    // ============================================================
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");

    if (!signature || !timestamp) {
      return new Response("Missing Discord signature headers", { status: 401 });
    }

    const body = await request.text();

    const valid = await verifyDiscordRequest(
      signature,
      timestamp,
      body,
      env.DISCORD_PUBLIC_KEY
    );

    if (!valid) {
      return new Response("Invalid request signature", { status: 401 });
    }

    const interaction = JSON.parse(body);

    // ============================================================
    // DISCORD PING
    // ============================================================
    if (interaction.type === 1) {
      return Response.json({ type: 1 });
    }

    // ============================================================
    // /setup-profile (SLASH COMMAND - TYPE 2)
    // ============================================================
    if (
      interaction.type === 2 &&
      interaction.data?.name === "setup-profile"
    ) {
      return Response.json({
        type: 4,
        data: {
          content:
            "Welcome to the DSA community!\n\n" +
            "Before accessing the main server, please complete your profile.\n\n" +
            "Click the button below to continue.",
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 1,
                  label: "Set Up My Profile",
                  custom_id: "setup_profile",
                },
              ],
            },
          ],
        },
      });
    }

    // ============================================================
    // PROFILE BUTTON (MESSAGE COMPONENT - TYPE 3)
    // ============================================================
    if (
      interaction.type === 3 &&
      interaction.data?.custom_id === "setup_profile"
    ) {
      return Response.json({
        type: 9, // MODAL
        data: {
          custom_id: "profile_modal",
          title: "Set Up Your Profile",
          components: [
            // First Name
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "first_name",
                  label: "First Name",
                  style: 1,
                  min_length: 1,
                  max_length: 20,
                  required: true,
                  placeholder: "Enter your first name",
                },
              ],
            },
            // Last Name
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "last_name",
                  label: "Last Name",
                  style: 1,
                  min_length: 1,
                  max_length: 30,
                  required: true,
                  placeholder: "Enter your last name",
                },
              ],
            },
            // Year
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "year",
                  label: "Year",
                  style: 1,
                  min_length: 1,
                  max_length: 10,
                  required: true,
                  placeholder: "FE, SE, TE, BE, or Alum",
                },
              ],
            },
            // Division
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "division",
                  label: "Division",
                  style: 1,
                  min_length: 1,
                  max_length: 5,
                  required: true,
                  placeholder: "A, B, or C",
                },
              ],
            },
          ],
        },
      });
    }

    // ============================================================
    // MODAL SUBMISSION (MODAL SUBMIT - TYPE 5)
    // ============================================================
    if (
      interaction.type === 5 &&
      interaction.data?.custom_id === "profile_modal"
    ) {
      ctx.waitUntil(processProfileSubmission(interaction, env));

      return Response.json({
        type: 5, // DeferredChannelMessageWithSource
        data: {
          flags: 64,
        },
      });
    }

    // ============================================================
    // UNKNOWN INTERACTION
    // ============================================================
    return new Response("Unknown interaction", { status: 400 });
  },
};

// ============================================================
// BACKGROUND PROFILE PROCESSING & VALIDATION
// ============================================================
async function processProfileSubmission(interaction, env) {
  const values = {};

  for (const row of interaction.data.components ?? []) {
    for (const component of row.components ?? []) {
      if (component.type === 4) {
        values[component.custom_id] = component.value;
      }
    }
  }

  const editOriginalResponse = async (content) => {
    await fetch(
      `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content, flags: 64 }),
      }
    );
  };

  const rawFirstName = values.first_name?.trim();
  const rawLastName = values.last_name?.trim();
  const rawYear = values.year?.trim().toLowerCase();
  const rawDivision = values.division?.trim().toLowerCase();

  // Check if fields are empty
  if (!rawFirstName || !rawLastName || !rawYear || !rawDivision) {
    await editOriginalResponse("Please complete all profile fields.");
    return;
  }

  // Validate and normalize Year
  const validYears = {
    "fe": "FE",
    "se": "SE",
    "te": "TE",
    "be": "BE",
    "alum": "Alum"
  };

  const year = validYears[rawYear];
  if (!year) {
    await editOriginalResponse("Invalid Year entered! Please enter only: FE, SE, TE, BE, or Alum.");
    return;
  }

  // Validate and normalize Division
  const validDivisions = {
    "a": "A",
    "b": "B",
    "c": "C"
  };

  const division = validDivisions[rawDivision];
  if (!division) {
    await editOriginalResponse("Invalid Division entered! Please enter only: A, B, or C.");
    return;
  }

  const firstName = rawFirstName.replace(/\b\w/g, (char) => char.toUpperCase());
  const lastName = rawLastName.replace(/\b\w/g, (char) => char.toUpperCase());

  const nickname = `${firstName} ${lastName} | ${year} | ${division}`.slice(0, 32);
  const guildId = interaction.guild_id;
  const userId = interaction.member?.user?.id;

  if (!guildId || !userId) {
    await editOriginalResponse("This profile setup can only be used inside the server.");
    return;
  }

  // Execute Discord API calls in parallel
  const [nicknameResponse, addRoleResponse, removeRoleResponse] = await Promise.all([
    discordRequest(
      `/guilds/${guildId}/members/${userId}`,
      env.DISCORD_BOT_TOKEN,
      {
        method: "PATCH",
        body: JSON.stringify({ nick: nickname }),
      }
    ),
    discordRequest(
      `/guilds/${guildId}/members/${userId}/roles/${MEMBER_ROLE_ID}`,
      env.DISCORD_BOT_TOKEN,
      { method: "PUT" }
    ),
    discordRequest(
      `/guilds/${guildId}/members/${userId}/roles/${UNVERIFIED_ROLE_ID}`,
      env.DISCORD_BOT_TOKEN,
      { method: "DELETE" }
    ),
  ]);

  if (!nicknameResponse.ok) {
    console.error("Nickname change failed:", await nicknameResponse.text());
    await editOriginalResponse("I couldn't change your nickname. Please contact a moderator.");
    return;
  }

  if (!addRoleResponse.ok) {
    console.error("Adding Member role failed:", await addRoleResponse.text());
    await editOriginalResponse("Your nickname was changed, but I couldn't give you the Member role.");
    return;
  }

  if (!removeRoleResponse.ok && removeRoleResponse.status !== 404) {
    console.error("Removing Unverified role failed:", await removeRoleResponse.text());
    await editOriginalResponse("Your profile was updated, but I couldn't remove the Unverified role.");
    return;
  }

  await editOriginalResponse(
    "Profile setup complete!\n\n" +
    `Name: ${firstName} ${lastName}\n` +
    `Year: ${year}\n` +
    `Division: ${division}\n` +
    `Nickname: ${nickname}\n\n` +
    "You now have access to the member channels."
  );
}

// ============================================================
// DISCORD API REQUEST
// ============================================================
async function discordRequest(path, token, options = {}) {
  const headers = {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  return fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers,
  });
}

// ============================================================
// DISCORD SIGNATURE VERIFICATION
// ============================================================
async function verifyDiscordRequest(signature, timestamp, body, publicKey) {
  try {
    const message = new TextEncoder().encode(timestamp + body);
    const signatureBytes = hexToUint8Array(signature);
    const publicKeyBytes = hexToUint8Array(publicKey);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      publicKeyBytes,
      {
        name: "Ed25519",
      },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify(
      {
        name: "Ed25519",
      },
      cryptoKey,
      signatureBytes,
      message
    );
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}

// ============================================================
// HEX → UINT8ARRAY
// ============================================================
function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }

  return bytes;
}