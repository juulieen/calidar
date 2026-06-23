import { mount } from "svelte";
import "@calidar/svelte/styles.css";
import "./app.css";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("#app not found");

const app = mount(App, { target });

export default app;
