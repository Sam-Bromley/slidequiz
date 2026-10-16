/** Runs before anything else reads the address, so a fresh start opens each tab on its list. */
import { freshStart } from "./session";

freshStart();
