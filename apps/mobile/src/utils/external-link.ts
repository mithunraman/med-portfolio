import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

// Two ways to open URLs externally — picked deliberately, not interchangeably.
//
//   openSystemLink     → expo-linking.openURL. Hands off to the OS to pick a
//                        handler. Required for App Store / Play Store URLs,
//                        non-https schemes (tel:, mailto:, acme://), and
//                        anywhere the URL might be a deep link.
//
//   openInAppBrowser   → expo-web-browser.openBrowserAsync. Renders in an
//                        embedded SFSafariViewController (iOS) / Chrome
//                        Custom Tab (Android). Keeps the user in the app's
//                        context — Apple's recommended pattern for in-flow
//                        legal disclosure (privacy, terms) during signup.
//                        Only accepts http(s) URLs.

export function openSystemLink(url: string): Promise<boolean> {
  return Linking.openURL(url);
}

export function openInAppBrowser(url: string): Promise<WebBrowser.WebBrowserResult> {
  return WebBrowser.openBrowserAsync(url);
}
