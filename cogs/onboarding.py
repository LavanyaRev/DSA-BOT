import discord
from discord import app_commands
from discord.ext import commands


# ============================================================
# ROLE NAMES
# Change these if your Discord role names are different.
# ============================================================

MEMBER_ROLE_NAME = "Member"
UNVERIFIED_ROLE_NAME = "Unverified"


# ============================================================
# PROFILE MODAL
# ============================================================

class ProfileModal(discord.ui.Modal, title="Set Up Your Profile"):

    first_name = discord.ui.TextInput(
        label="First Name",
        placeholder="Enter your first name",
        min_length=1,
        max_length=20,
        required=True,
    )

    last_name = discord.ui.TextInput(
        label="Last Name",
        placeholder="Enter your last name",
        min_length=1,
        max_length=30,
        required=True,
    )

    year = discord.ui.TextInput(
        label="Year",
        placeholder="Example: 1st Year",
        min_length=1,
        max_length=20,
        required=True,
    )

    division = discord.ui.TextInput(
        label="Division",
        placeholder="Example: A",
        min_length=1,
        max_length=10,
        required=True,
    )

    
    async def on_submit(self, interaction: discord.Interaction):

        if interaction.guild is None:
            await interaction.response.send_message(
                "This can only be used inside the server.",
                ephemeral=True,
            )
            return

        member = interaction.user

        member_role = discord.utils.get(
            interaction.guild.roles,
            name=MEMBER_ROLE_NAME,
        )

        unverified_role = discord.utils.get(
            interaction.guild.roles,
            name=UNVERIFIED_ROLE_NAME,
        )

        if member_role is None:
            await interaction.response.send_message(
                f"I couldn't find the `{MEMBER_ROLE_NAME}` role. "
                "Please contact a moderator.",
                ephemeral=True,
            )
            return

        first_name = self.first_name.value.strip()
        last_name = self.last_name.value.strip()
        year = self.year.value.strip()
        division = self.division.value.strip()

        new_nickname = (
            f"{first_name} {last_name} | {year} | {division}"
        )

        # Discord nickname limit
        new_nickname = new_nickname[:32]

        # --------------------------------------------------
        # 1. Change nickname
        # --------------------------------------------------

        try:
            await member.edit(
                nick=new_nickname,
                reason="Completed mandatory profile setup",
            )

        except discord.Forbidden:
            await interaction.response.send_message(
                "I cannot change your nickname. "
                "Check the bot's Manage Nicknames permission "
                "and role hierarchy.",
                ephemeral=True,
            )
            return

        except discord.HTTPException:
            await interaction.response.send_message(
                "I couldn't change your nickname. Please try again.",
                ephemeral=True,
            )
            return

        # --------------------------------------------------
        # 2. Add Member role
        # --------------------------------------------------

        try:
            await member.add_roles(
                member_role,
                reason="Completed mandatory profile setup",
            )

        except discord.Forbidden:
            await interaction.response.send_message(
                "Your nickname was changed successfully, "
                "but I cannot give you the Member role.\n\n"
                "Make sure the bot's role is ABOVE the Member role "
                "in Server Settings → Roles and that the bot has "
                "Manage Roles permission.",
                ephemeral=True,
            )
            return

        except discord.HTTPException:
            await interaction.response.send_message(
                "Your nickname was changed, but I couldn't "
                "give you the Member role.",
                ephemeral=True,
            )
            return

        # --------------------------------------------------
        # 3. Remove Unverified role
        # --------------------------------------------------

        if (
            unverified_role is not None
            and unverified_role in member.roles
        ):
            try:
                await member.remove_roles(
                    unverified_role,
                    reason="Completed mandatory profile setup",
                )

            except discord.Forbidden:
                await interaction.response.send_message(
                    "Your nickname and Member role were updated, "
                    "but I cannot remove the Unverified role.\n\n"
                    "Make sure the bot's role is ABOVE the "
                    "Unverified role.",
                    ephemeral=True,
                )
                return

            except discord.HTTPException:
                await interaction.response.send_message(
                    "Your profile was mostly updated, but I "
                    "couldn't remove the Unverified role.",
                    ephemeral=True,
                )
                return

        # --------------------------------------------------
        # 4. Everything succeeded
        # --------------------------------------------------

        await interaction.response.send_message(
            "Profile setup complete!\n\n"
            f"**Name:** {first_name} {last_name}\n"
            f"**Year:** {year}\n"
            f"**Division:** {division}\n"
            f"**Server nickname:** {new_nickname}\n\n"
            "You now have access to the member channels.",
            ephemeral=True,
        )



# ============================================================
# BUTTON
# ============================================================

class ProfileButton(discord.ui.Button):

    def __init__(self):
        super().__init__(
            label="Set Up My Profile",
            style=discord.ButtonStyle.primary,
            custom_id="setup_profile_button",
        )

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.send_modal(ProfileModal())


# ============================================================
# BUTTON VIEW
# ============================================================

class ProfileView(discord.ui.View):

    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(ProfileButton())


# ============================================================
# ONBOARDING COG
# ============================================================

class Onboarding(commands.Cog):

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(
        name="setup-profile",
        description="Post the profile setup button.",
    )
    @app_commands.default_permissions(manage_guild=True)
    async def setup_profile(
        self,
        interaction: discord.Interaction,
    ):

        embed = discord.Embed(
            title="Set Up Your Profile",
            description=(
                "Welcome to the DSA community!\n\n"
                "Before accessing the main server, "
                "please set up your profile.\n\n"
                "Click the button below and enter your "
                "name and year."
            ),
        )

        embed.set_footer(
            text="Your information is used to set your server nickname."
        )

        await interaction.channel.send(
            embed=embed,
            view=ProfileView(),
        )

        await interaction.response.send_message(
            "Profile setup panel created.",
            ephemeral=True,
        )


# ============================================================
# EXTENSION SETUP
# ============================================================

async def setup(bot: commands.Bot):
    await bot.add_cog(Onboarding(bot))