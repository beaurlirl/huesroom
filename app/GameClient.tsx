"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { isMenuAddress } from "@/src/menuAddress";

const Game = dynamic(() => import("@/src/Game"), { ssr: false });
const HomeMenu = dynamic(() => import("@/src/ui/HomeMenu").then((m) => m.HomeMenu), { ssr: false });

const subscribeNever = () => () => {};

/** The plain address opens the home menu, with no level loaded behind it; any other address goes straight into the game. */
export default function GameClient() {
  // null while the page is still being hydrated: nothing is mounted (so no level starts loading) until the address has been read.
  const menu = useSyncExternalStore(subscribeNever, () => isMenuAddress(window.location.search), () => null);
  if (menu === null) return null;
  return menu ? <HomeMenu /> : <Game />;
}
