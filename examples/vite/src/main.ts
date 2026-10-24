import { card, cardBody, cardTitle } from "./card.module.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <article class="${card}">
    <h1 class="${cardTitle}">Typed CSS Modules</h1>
    <p class="${cardBody}">
      Rename a class in card.module.css and <code>tsc --runExternalCode</code> points at every
      import that still uses the old name.
    </p>
  </article>
`;
