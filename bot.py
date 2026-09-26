import os

import discord
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")

if not TOKEN:
    raise RuntimeError("DISCORD_TOKEN was not found in the .env file.")

intents = discord.Intents.default()
intents.members = True


class DSABot(commands.Bot):

    def __init__(self):
        super().__init__(
            command_prefix="!",
            intents=intents,
        )

    async def setup_hook(self):
        print("Loading onboarding cog...")

        await self.load_extension("cogs.onboarding")

        print("Onboarding cog loaded.")

        synced = await self.tree.sync()

        print(f"Synced {len(synced)} slash command(s).")


bot = DSABot()


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user} (ID: {bot.user.id})")


bot.run(TOKEN)