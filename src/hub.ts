import "@fontsource/young-serif/400.css";
import "@fontsource-variable/schibsted-grotesk";
import "./hub.css";

// Old QuidsIn links looked like https://host/#/g/QI-XXXX-XXXX. Send them to the app.
if (location.hash.startsWith("#/")) location.replace("/quidsin/" + location.hash);
