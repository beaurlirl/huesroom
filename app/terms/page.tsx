import type { Metadata } from "next";
import { GAME_NAME } from "../_legal/contact";
import { Contact, LegalPage, Section } from "../_legal/LegalPage";

export const metadata: Metadata = { title: `Terms · ${GAME_NAME}`, robots: { index: true } };

export default function Terms() {
  return (
    <LegalPage title="Terms">
      <Section title="Playing">
        <p>
          {GAME_NAME} is a game for you to play for fun. It is provided as it is, with no promise that it will always work, be free of faults or stay
          available. Please do not copy it, resell it or take it apart.
        </p>
      </Section>

      <Section title="Who made it">
        <p>
          The game, its characters, models, music and writing belong to Gest, who made it in Lower Manhattan. Places in the game are drawn from the real
          neighbourhood for fun. The street layout uses map data from OpenStreetMap contributors. Names, signs and products in the game are made up or
          generic and are not endorsements.
        </p>
      </Section>

      <Section title="Coins and purchases">
        <p>
          Coins you earn in the game have no value outside it and cannot be exchanged for money. If the app offers coin packs, they are bought through your
          device&rsquo;s store, are handled by it under its own terms, and are for use in the game only.
        </p>
      </Section>

      <Section title="Your progress">
        <p>
          Your times and coins are kept on your device only (see Privacy). We cannot restore them if they are lost, for instance if you delete the app.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          Write to <Contact /> or see the Support page. <span className="bg-yellow-200 px-1">[owner to review these terms before the game is submitted]</span>
        </p>
      </Section>
    </LegalPage>
  );
}
