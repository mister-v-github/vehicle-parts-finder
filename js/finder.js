const CSV_PATH = "/vehicle_catalog.csv"; // load catalog file
const STORAGE_KEY = "last_vehicle";             // Store last entered vehicle data {Year:"2015", Make:"RAM", Model:"1500"}

// DOM Elements
const qs = id => document.getElementById(id);
const overlay = qs("overlay");
const inputs = { year: qs("year-input"), make: qs("make-input"), model: qs("model-input"), ptype: qs("ptype-input") };
const suggests = {year: qs("year-sug"),make: qs("make-sug"),model: qs("model-sug"),ptype: qs("ptype-sug")};
const goBtn = qs("goBtn");

//State variables
let catalog = []; // contains vehicle details after CSV loaded. Year: "2015", Make: "RAM", Model: "1500", "Product Type": "Front Bumper", URL: "https://partifyusa.com/collections/2015-ram-1500" 
const fuse = { year: null, make: null, model: null, ptype: null }; //holds years
const options = { year: [], make: [], model: [], ptype: [] }; // holds make list based on selected year
let suppressShowOnFocus = false;

// utility functions 
const normalize = v => (v || "").toString().trim(); // Normalize("rAm") -> "RAM"
const unique = (arr, key) => [...new Set(arr.map(i => normalize(i[key])).filter(Boolean))].sort(); //["RAM", "ram", "FORD", ""] -> ["FORD","RAM"]
const persistLast = r => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); } catch {} }; // Stores last selected vehicle data
const buildCollectionURL = (y, m, mo) =>
  `https://partifyusa.com/collections/${encodeURIComponent(y)}-${encodeURIComponent(m)}-${encodeURIComponent(mo)}`; // buildCollectionURL("2015","RAM","1500") then "https://partifyusa.com/collections/2015-RAM-1500"

// now only year/make/model are required for enabling
const canGo = () =>
  ["year", "make", "model"].every(k => normalize(inputs[k].value)); // returns true or false
const enableGoIfReady = () => { goBtn.disabled = !canGo(); }; // enable/disable button

//style helpers to keep input in sync
const wireLabel = input => {
  const upd = () => input.classList[input.value.trim() ? "add" : "remove"]("filled");
  ["input", "blur"].forEach(e => input.addEventListener(e, upd));
  upd();
};  // make the content to float when input is filled and also checks and remove filled based on content availability

// function to render suggestions
const showSuggestion = (container, items, onSelect) => {
  container.innerHTML = "";
  if (!items.length) { container.hidden = true; return; }
  items.slice(0, 10).forEach(it => {
    const d = document.createElement("div");
    d.className = "suggestion";
    d.textContent = it;
    d.addEventListener("mousedown", e => { e.preventDefault(); onSelect(it); container.hidden = true; });
    container.appendChild(d);
  });
  container.hidden = false;
}; // shows 10 sugeestions in container and hides dropdown after selection

// hide suggestions when clicked outside
const hideAllSuggestions = () => Object.values(suggests).forEach(s => { if (s) s.hidden = true; });

// simple debounce for throttling rapids calls
const debounce = (fn, delay = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// validation
const validators = {

  // checks if the provided year exists in catalog  
  year: y => unique(catalog, "Year").map(v => v.toString()).includes(y),

  // given a year, checks if the make exists for that year
  make: (y, m) =>
    unique(catalog.filter(c => c.Year.toString() === y), "Make")
      .some(x => x.toLowerCase() === m.toLowerCase()),

  //given year + make, checks if model exists
  model: (y, m, mo) =>
    unique(
      catalog.filter(
        c => c.Year.toString() === y && c.Make.toLowerCase() === m.toLowerCase()
      ),
      "Model"
    ).some(x => x.toLowerCase() === mo.toLowerCase()),

  //returns the unique product types for a specific year/make/model combination
  ptype: (y, m, mo) =>
    unique(
      catalog.filter(
        c =>
          c.Year.toString() === y &&
          c.Make.toLowerCase() === m.toLowerCase() &&
          c.Model.toLowerCase() === mo.toLowerCase()
      ),
      "Product Type"
    )
};

// choice suggestions, returns choices list for each feild based on prior selction
const getChoices = {
  year: () => unique(catalog, "Year").map(v => v.toString()),
  make: () => {
    const y = normalize(inputs.year.value);
    return validators.year(y)
      ? unique(catalog.filter(c => c.Year.toString() === y), "Make")
      : [];
  },
  model: () => {
    const y = normalize(inputs.year.value);
    const m = normalize(inputs.make.value);
    return validators.year(y) && validators.make(y, m)
      ? unique(
          catalog.filter(
            c =>
              c.Year.toString() === y && c.Make.toLowerCase() === m.toLowerCase()
          ),
          "Model"
        )
      : [];
  },
  ptype: () => {
    const y = normalize(inputs.year.value);
    const m = normalize(inputs.make.value);
    const mo = normalize(inputs.model.value);
    return validators.year(y) && validators.make(y, m) && validators.model(y, m, mo)
      ? unique(
          catalog.filter(
            c =>
              c.Year.toString() === y &&
              c.Make.toLowerCase() === m.toLowerCase() &&
              c.Model.toLowerCase() === mo.toLowerCase()
          ),
          "Product Type"
        )
      : [];
  }
};

// wiring each input’s interactive behavior, brings out feild input and suggestion container
function attach(field) {
  const input = inputs[field];
  const sug = suggests[field];

// update state
  const updateStateAndUI = val => {
    input.value = val;
    const order = ["year", "make", "model", "ptype"];
    const idx = order.indexOf(field);
    order.slice(idx + 1).forEach(f => {
      inputs[f].value = "";
      fuse[f] = null;
      options[f] = [];
      inputs[f].disabled = true;
    });
    
    updateState(field, val);
    wireLabel(input);
    enableGoIfReady();
  };

  // input event handling
  const onInput = () => {
   
    const term = normalize(input.value);
    const f = fuse[field];
    let results = [];
    if (term && f) results = f.search(term).map(r => r.item);
    showSuggestion(sug, results, v => updateStateAndUI(v));
    enableGoIfReady();
    wireLabel(input);
  };

  // focus
  input.addEventListener("input", debounce(onInput, 300));
  input.addEventListener("focus", () => {
    if (suppressShowOnFocus) return;
    const choices = getChoices[field]().slice(0, 10);
    showSuggestion(sug, choices, v => updateStateAndUI(v));
  });


  // optional code
  // handing keyboard navigation
/*  input.addEventListener("keydown", e => {
    const items = Array.from(sug.querySelectorAll(".suggestion"));
    const activeIdx = items.findIndex(i => i.classList.contains("active"));
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!items.length) return;
      if (activeIdx === -1) items[0].classList.add("active");
      else {
        items[activeIdx].classList.remove("active");
        items[Math.min(activeIdx + 1, items.length - 1)].classList.add("active");
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (activeIdx > 0) {
        items[activeIdx].classList.remove("active");
        items[activeIdx - 1].classList.add("active");
      }
    } else if (e.key === "Enter") {
      const active = items[activeIdx];
      if (active) {
        e.preventDefault();
        updateStateAndUI(active.textContent);
        sug.hidden = true;
      }
    }
  }); 
*/
  input.addEventListener("blur", () => setTimeout(() => (sug.hidden = true), 150));
} 

//update state
function updateState(field, val) {
  const year = normalize(inputs.year.value); // reads values of input
  const make = normalize(inputs.make.value);
  const model = normalize(inputs.model.value);
  if (field === "year") {
    if (validators.year(val)) {
      options.make = unique(catalog.filter(c => c.Year.toString() === val), "Make");
      fuse.make = new Fuse(options.make, { threshold: 0.3 });
      inputs.make.disabled = false;
    } else {
      options.make = [];
      fuse.make = null;
      inputs.make.disabled = true;
    }
    options.model = [];
    fuse.model = null;
    inputs.model.disabled = true;
    options.ptype = [];
    fuse.ptype = null;
    inputs.ptype.disabled = true; 
    /*
    if year valid ("2015"):
    Populates options.make with all makes under 2015, e.g., ["RAM"]
    Initializes fuse.make to allow fuzzy searching makes.
    Enables the make input. Clears downstream model and ptype state. 
    */
  } else if (field === "make") {
    if (validators.year(year) && validators.make(year, val)) {
      options.model = unique(
        catalog.filter(
          c =>
            c.Year.toString() === year && c.Make.toLowerCase() === val.toLowerCase()
        ),
        "Model"
      );
      fuse.model = new Fuse(options.model, { threshold: 0.3 });
      inputs.model.disabled = false;
    } else {
      options.model = [];
      fuse.model = null;
      inputs.model.disabled = true;
    }
    options.ptype = [];
    fuse.ptype = null;
    inputs.ptype.disabled = true;
    /*
    options.model = ["1500"]
    fuse.model created.
    Enables model input.
    Clears ptype.
    */
  } else if (field === "model") {
    if (
      validators.year(year) &&
      validators.make(year, make) &&
      validators.model(year, make, val)
    ) {
      options.ptype = unique(
        catalog.filter(
          c =>
            c.Year.toString() === year &&
            c.Make.toLowerCase() === make.toLowerCase() &&
            c.Model.toLowerCase() === val.toLowerCase()
        ),
        "Product Type"
      );
      fuse.ptype = new Fuse(options.ptype, { threshold: 0.3 });
      inputs.ptype.disabled = false;
    } else {
      options.ptype = [];
      fuse.ptype = null;
      inputs.ptype.disabled = true;
    }
  }
}
/*
options.ptype = ["Front Bumper"]
fuse.ptype created.
Enables product type input.
*/

// add vehicle onclick handling
goBtn.addEventListener("click", e => {
  e.preventDefault();

  //normalize inputs
  const year = normalize(inputs.year.value);
  const make = normalize(inputs.make.value);
  const model = normalize(inputs.model.value);
  const ptype = normalize(inputs.ptype.value);

  // combination validation
  if (
    !validators.year(year) ||
    !validators.make(year, make) ||
    !validators.model(year, make, model)
  ) {
    return;
  }

  let finalUrl = buildCollectionURL(year, make, model);

  // verifying product type provided and appending it to final url
  if (ptype) {
    const sep = finalUrl.includes("?") ? "&" : "?";
    finalUrl = `${finalUrl}${sep}filter.p.product_type=${encodeURIComponent(ptype)}`;
  }
  
  // selection to localstorage
  persistLast({ Year: year, Make: make, Model: model, ...(ptype && { "Product Type": ptype }) });
  window.location.href = finalUrl; // redirection
});

// hide suggestions
document.addEventListener("click", e => {
  const inside = Object.values(inputs).some(i => i && i.contains(e.target)) ||
    Object.values(suggests).some(s => s && s.contains(e.target));
  if (!inside) hideAllSuggestions();
});

function loadCatalogAndInit(src) {
  Papa.parse(src, { //fetches csv
    header: true,
    skipEmptyLines: true,
    download: true,
    complete({ data }) {
      catalog = data
        .map(r => ({
          Year: normalize(r["Year"]),
          Make: (r["Make"] || "").trim(),
          Model: (r["Model"] || "").trim(),
          "Product Type": (r["Product Type"] || "").trim(),
          URL: (r["URL"] || "").trim()
        }))
        .filter(r => r.Year && r.Make && r.Model); // transforms selected choices

      if (!catalog.length) {
        console.warn("Empty after parse, using fallback.");
        catalog = [
          {
            Year: "2015",
            Make: "RAM",
            Model: "1500",
            "Product Type": "Front Bumper",
            URL: "https://partifyusa.com/collections/2015-ram-1500"
          }
        ];
      } // hardcoded incase csv fails

      fuse.year = new Fuse(unique(catalog, "Year").map(y => y.toString()), { threshold: 0.3 });
      overlay.style.display = "none";
      ["year", "make", "model", "ptype"].forEach(f => {
        wireLabel(inputs[f]);
        attach(f);
        inputs[f].addEventListener("input", enableGoIfReady);
        inputs[f].addEventListener("blur", enableGoIfReady);
      });
      enableGoIfReady();
      hideAllSuggestions();
      Object.values(inputs).forEach(i => i.blur());
    },
    error() { // if csv load fails
      console.warn("CSV load failed.");
      overlay.style.display = "none";
      ["year", "make", "model", "ptype"].forEach(f => {
        wireLabel(inputs[f]);
        attach(f);
      });
    }
  });
}

// clean sttate ensures boxes are hidden inputs are blurred on load
window.addEventListener("load", () => {
  hideAllSuggestions();
  Object.values(inputs).forEach(i => i && i.blur());
});

// clears previous selections and calls catalog to start 
document.addEventListener("DOMContentLoaded", () => {
  localStorage.removeItem(STORAGE_KEY);
  loadCatalogAndInit(CSV_PATH);
});
