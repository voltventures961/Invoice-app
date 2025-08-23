import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            # The app runs on port 3000 by default
            await page.goto("http://localhost:3000")

            # Wait for the app to load, assuming Dashboard is the initial page
            await expect(page.get_by_role("heading", name="Dashboard")).to_be_visible(timeout=20000)

            # Navigate to Settings
            await page.get_by_role("link", name="Settings").click()
            await expect(page.get_by_role("heading", name="Settings")).to_be_visible()

            # Fill in business details
            await page.get_by_label("Company Name").fill("Jules's Awesome Co.")
            await page.get_by_label("Address").fill("123 Main St, Anytown, USA")
            await page.get_by_label("Phone Number").fill("555-123-4567")
            await page.get_by_label("Email Address").fill("jules@awesome.co")

            # Take a screenshot of the settings page
            await page.screenshot(path="jules-scratch/verification/settings_page.png")

            # Navigate to Proformas page
            await page.get_by_role("link", name="Proformas").click()
            await expect(page.get_by_role("heading", name="Proformas")).to_be_visible()

            # Check for the search bar
            await expect(page.get_by_placeholder("Search by number, client, or date...")).to_be_visible()

            # Take a screenshot of the proformas page
            await page.screenshot(path="jules-scratch/verification/proformas_page.png")

            print("Verification script ran successfully.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="jules-scratch/verification/error.png")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
