import type { Metadata } from "next";
import { GAME_NAME } from "../_legal/contact";
import { Contact, LegalPage, Section } from "../_legal/LegalPage";

export const metadata: Metadata = { title: `Support · ${GAME_NAME}`, robots: { index: true } };

const row = "grid grid-cols-1 gap-x-4 gap-y-1 border-b py-2 sm:grid-cols-[9rem_1fr]";

export default function Support() {
  return (
    <LegalPage title="Support">
      <Section title="The game">
        <p>
          Hue leaves home and runs, climbs and jumps through real places in Lower Manhattan, collecting every coin as fast as he can.
          There is no losing: coins always count, and a faster run earns a bonus.
        </p>
      </Section>

      <Section title="Controls">
        <div className="text-sm">
          <div className={row} style={{ borderColor: "var(--glass-edge)" }}>
            <span className="ui font-bold">iPhone</span>
            <span>Joystick on the left to move (push it all the way to run). Jump button on the right. Drag on the right half of the screen to peek around.</span>
          </div>
          <div className={row} style={{ borderColor: "var(--glass-edge)" }}>
            <span className="ui font-bold">Keyboard</span>
            <span>W A S D or arrow keys to move, Shift to run, Space to jump, Esc or P to pause, R to restart.</span>
          </div>
          <div className={row} style={{ borderColor: "var(--glass-edge)" }}>
            <span className="ui font-bold">Game controller</span>
            <span>Left stick to move (push it all the way to run, or hold a bumper), A to jump, right stick to look around, Menu to pause, View to restart.</span>
          </div>
        </div>
        <p>Walk into a ledge and keep pushing to climb it. Walk into a ladder to climb it. Bags and beanbags bounce.</p>
      </Section>

      <Section title="Questions">
        <p>
          <strong>Where is my progress saved?</strong> On your device only. There are no accounts, so we cannot move or restore it:
          deleting the app, or clearing the website&rsquo;s data in your browser, erases your times and coins.
        </p>
        <p>
          <strong>The game runs slowly.</strong> Close other apps, turn off Low Power Mode, and keep the device cool. It is built for
          recent iPhones.
        </p>
        <p>
          <strong>There is no sound.</strong> Check the silent switch and the sound toggles on the pause and finish screens.
        </p>
        <p>
          <strong>Purchases and refunds.</strong> Purchases go through Apple, so refunds are handled by Apple at reportaproblem.apple.com.
        </p>
      </Section>

      <Section title="Report a problem">
        <p>
          Write to <Contact /> with your device model, your iOS version and what happened. A screen recording helps a lot.
        </p>
      </Section>
    </LegalPage>
  );
}
