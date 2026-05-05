import { Redirect } from 'expo-router';

/**
 * Root route. expo-router does not auto-pick a default tab inside a
 * `(tabs)` group, so a deep link like `exp://host:port/--/` lands on
 * "Unmatched Route" without an explicit `/` handler. Redirect into
 * the Cats tab (the platform's directory landing) so the canonical
 * first surface shows up on launch.
 */
export default function Index() {
  return <Redirect href="/cats" />;
}
