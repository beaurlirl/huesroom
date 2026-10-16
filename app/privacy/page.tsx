import type { Metadata } from "next";
import { GAME_NAME } from "../_legal/contact";
import { Contact, LegalPage, Section } from "../_legal/LegalPage";

export const metadata: Metadata = { title: `Privacy · ${GAME_NAME}`, robots: { index: true } };

export default function Privacy() {
  return (
    <LegalPage title="Privacy">
      <Section title="The short version">
        <p>
          {GAME_NAME} does not collect your data. There are no accounts, no ads, no analytics and no trackers. Everything the game
          remembers stays on your device.
        </p>
      </Section>

      <Section title="What the game remembers (on your device only)">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your best time at each location.</li>
          <li>The coins you have earned, and anything you have unlocked or bought with them.</li>
          <li>Your sound and music settings.</li>
          <li>A note that you have played before, so the title screen is shorter next time.</li>
        </ul>
        <p>
          This is kept in your device&rsquo;s own storage. We never receive it and cannot see it, so we cannot restore it either.
          Deleting the app (or clearing this website&rsquo;s data in your browser) erases it.
        </p>
      </Section>

      <Section title="What we do not do">
        <ul className="list-disc space-y-1 pl-5">
          <li>No accounts or sign-in.</li>
          <li>No analytics, tracking, advertising or cookies.</li>
          <li>No third-party code that collects anything.</li>
          <li>No chat and no AI features.</li>
          <li>No links that take you out of the game.</li>
        </ul>
      </Section>

      <Section title="The iPhone app">
        <p>The app runs from files inside the app itself and does not make network requests.</p>
      </Section>

      <Section title="The web version">
        <p>
          On the web, the game&rsquo;s files are delivered by our hosting provider, Vercel. Like any web host, it may keep standard
          technical logs (for example an IP address and browser type) to run and secure the service. We do not use them to identify
          or track players.
        </p>
      </Section>

      <Section title="Sharing">
        <p>
          If you press Share on the finish screen, the game makes a picture on your device and hands it to your device&rsquo;s share
          menu. Where it goes is your choice; we do not receive it.
        </p>
      </Section>

      <Section title="Purchases">
        <p>
          If coin packs are offered in the app, they are bought through Apple&rsquo;s in-app purchase. Apple handles the payment; we
          never see your card or Apple ID.
        </p>
      </Section>

      <Section title="Children">
        <p>The game collects no personal information from anyone, including children.</p>
      </Section>

      <Section title="If this changes">
        <p>
          If we ever add something that changes the above (for example accounts or an online feature), we will update this page and the
          App Store privacy details before it ships.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions: <Contact />
        </p>
      </Section>
    </LegalPage>
  );
}
