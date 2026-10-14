"use strict";

document.querySelectorAll("[data-year]").forEach(function (element) {
  element.textContent = String(new Date().getFullYear());
});

var cinemaIntro = document.getElementById("cinema-intro");
if (cinemaIntro) {
  var skipIntroButton = document.getElementById("cinema-intro-skip");
  document.body.classList.add("cinema-intro-active");

  function finishCinemaIntro() {
    cinemaIntro.hidden = true;
    document.body.classList.remove("cinema-intro-active");
  }

  cinemaIntro.addEventListener("animationend", function (event) {
    if (event.target === cinemaIntro && event.animationName === "cinema-intro-exit") {
      finishCinemaIntro();
    }
  });

  if (skipIntroButton) {
    skipIntroButton.addEventListener("click", function () {
      cinemaIntro.classList.add("is-skipped");
      document.body.classList.remove("cinema-intro-active");
      window.setTimeout(finishCinemaIntro, 220);
    });
  }
}

var workFilters = document.querySelectorAll(".work-filter");
if (workFilters.length) {
  var workCards = document.querySelectorAll(".work-card");
  var workGrid = document.getElementById("work-grid");
  var filterStatus = document.getElementById("work-filter-status");

  workFilters.forEach(function (button) {
    button.addEventListener("click", function () {
      var selectedCategory = button.dataset.filter;
      var visibleCount = 0;

      workFilters.forEach(function (filterButton) {
        var selected = filterButton === button;
        filterButton.classList.toggle("is-active", selected);
        filterButton.setAttribute("aria-pressed", String(selected));
      });

      workCards.forEach(function (card) {
        var matchesCategory = selectedCategory === "all" || card.dataset.category === selectedCategory;
        card.hidden = !matchesCategory;
        if (matchesCategory) visibleCount += 1;
      });

      workGrid.classList.toggle("is-filtered", selectedCategory !== "all");
      filterStatus.textContent = "Showing " + visibleCount + " concept " + (visibleCount === 1 ? "project." : "projects.");
    });
  });
}

var canAnimate = window.matchMedia && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (document.body.classList.contains("home-page") && canAnimate && "IntersectionObserver" in window) {
  document.body.classList.add("motion-ready");
  var revealObserver = new IntersectionObserver(function (entries, observer) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });

  document.querySelectorAll("[data-reveal]").forEach(function (element) {
    revealObserver.observe(element);
  });
}

var menuButton = document.querySelector(".menu-toggle");
var navigation = document.getElementById("primary-nav");

if (menuButton && navigation) {
  menuButton.addEventListener("click", function () {
    var expanded = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!expanded));
    menuButton.setAttribute("aria-label", expanded ? "Open navigation" : "Close navigation");
    navigation.classList.toggle("nav-open", !expanded);
  });

  navigation.addEventListener("click", function (event) {
    if (event.target instanceof Element && event.target.closest("a")) {
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open navigation");
      navigation.classList.remove("nav-open");
    }
  });
}

var contactForm = document.getElementById("contact-form");
if (contactForm instanceof HTMLFormElement) {
  contactForm.addEventListener("input", function () {
    delete contactForm.dataset.submissionId;
  });

  var params = new URLSearchParams(window.location.search);
  var requestedService = (params.get("service") || "").toLowerCase();
  var serviceAliases = {
    websites: "website",
    automation: "ai automation",
    crm: "crm integrations",
    seo: "seo",
    maintenance: "maintenance"
  };
  requestedService = serviceAliases[requestedService] || requestedService;
  var serviceSelect = contactForm.elements.namedItem("service");
  if (serviceSelect instanceof HTMLSelectElement) {
    var matchingOption = Array.from(serviceSelect.options).find(function (option) {
      return option.value.toLowerCase().includes(requestedService);
    });
    if (matchingOption) serviceSelect.value = matchingOption.value;
  }

  contactForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearFieldErrors(contactForm);

    var status = document.getElementById("form-status");
    var fields = new FormData(contactForm);
    var phone = String(fields.get("phone") || "");
    var normalizedPhone = phone.replace(/[\s()-]/g, "");
    var phoneInput = contactForm.elements.namedItem("phone");
    if (!/^\+?[1-9]\d{7,14}$/.test(normalizedPhone)) {
      setFieldError(phoneInput, "Enter a phone number with country code, e.g. +919876543210.");
    }

    if (!contactForm.reportValidity() || contactForm.querySelector(".field-error:not(:empty)")) {
      return;
    }

    if (String(fields.get("website") || "").trim()) {
      showFormStatus(status, "We could not accept this enquiry. Please try again.", true);
      return;
    }

    var config = window.ETHIXWEB_CONFIG || {};
    if (!config.contactFunctionUrl || !config.supabaseAnonKey) {
      showFormStatus(status, "Enquiry submission is not configured yet. Please try again later or contact Ethixweb directly.", true);
      return;
    }

    var submitButton = contactForm.querySelector('button[type="submit"]');
    var buttonText = submitButton.querySelector("span");
    submitButton.disabled = true;
    buttonText.textContent = "Sending…";
    status.hidden = true;

    var payload = {
      submissionId: contactForm.dataset.submissionId || (contactForm.dataset.submissionId = crypto.randomUUID()),
      name: String(fields.get("name") || "").trim(),
      email: String(fields.get("email") || "").trim(),
      company: String(fields.get("company") || "").trim(),
      phone: normalizedPhone,
      service: String(fields.get("service") || ""),
      budget: String(fields.get("budget") || ""),
      message: String(fields.get("message") || "").trim(),
      consent: fields.get("consent") === "on",
      website: ""
    };

    try {
      var response = await fetch(config.contactFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": config.supabaseAnonKey,
          "Authorization": "Bearer " + config.supabaseAnonKey
        },
        body: JSON.stringify(payload)
      });
      var result = await response.json();
      if (!response.ok) {
        showFormStatus(status, result.message || "We could not save your enquiry. Please try again later.", true);
        return;
      }
      contactForm.reset();
      delete contactForm.dataset.submissionId;
      showFormStatus(status, result.message || "Thanks. Your enquiry has been received.", false);
    } catch (error) {
      console.error("Contact form submission failed:", error);
      showFormStatus(status, "We could not reach the enquiry service. Please try again later.", true);
    } finally {
      submitButton.disabled = false;
      buttonText.textContent = "Send enquiry";
    }
  });
}

function clearFieldErrors(form) {
  form.querySelectorAll(".field-error").forEach(function (error) {
    error.textContent = "";
  });
  form.querySelectorAll('[aria-invalid="true"]').forEach(function (input) {
    input.removeAttribute("aria-invalid");
  });
}

function setFieldError(input, message) {
  if (!(input instanceof HTMLElement)) return;
  input.setAttribute("aria-invalid", "true");
  var field = input.closest(".field");
  var error = field && field.querySelector(".field-error");
  if (error) error.textContent = message;
}

function showFormStatus(element, message, isError) {
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  element.classList.toggle("error", isError);
  element.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
