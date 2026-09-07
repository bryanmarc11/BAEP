// Tiny manifest: area titles/weights/counts only (no indicator text) so the
// dashboard can compute aggregate progress without loading full area content.
// Loaded as a plain <script> global (not fetch) so it works under file:// too.
window.BSESS_MANIFEST = {
  "program": "Bachelor of Science in Exercise and Sport Sciences",
  "instrument": "AACCUP, Inc. Master Survey Instrument",
  "ratingScale": [
    {
      "scale": 1,
      "min": 1.0,
      "max": 1.49,
      "label": "Poor"
    },
    {
      "scale": 2,
      "min": 1.5,
      "max": 2.49,
      "label": "Fair"
    },
    {
      "scale": 3,
      "min": 2.5,
      "max": 3.49,
      "label": "Satisfactory"
    },
    {
      "scale": 4,
      "min": 3.5,
      "max": 4.49,
      "label": "Very Satisfactory"
    },
    {
      "scale": 5,
      "min": 4.5,
      "max": 5.0,
      "label": "Excellent"
    }
  ],
  "areas": [
    {
      "id": "area-1",
      "roman": "I",
      "title": "Vision, Mission, Goals And Objectives",
      "weight": 2,
      "page": "area-1.html",
      "paramCount": 2,
      "leafTotal": 31
    },
    {
      "id": "area-2",
      "roman": "II",
      "title": "Faculty",
      "weight": 8,
      "page": "area-2.html",
      "paramCount": 8,
      "leafTotal": 151
    },
    {
      "id": "area-3",
      "roman": "III",
      "title": "Curriculum And Instruction",
      "weight": 8,
      "page": "area-3.html",
      "paramCount": 6,
      "leafTotal": 165
    },
    {
      "id": "area-4",
      "roman": "IV",
      "title": "Support To Students",
      "weight": 8,
      "page": "area-4.html",
      "paramCount": 5,
      "leafTotal": 187
    },
    {
      "id": "area-5",
      "roman": "V",
      "title": "Research",
      "weight": 5,
      "page": "area-5.html",
      "paramCount": 4,
      "leafTotal": 59
    },
    {
      "id": "area-6",
      "roman": "VI",
      "title": "Extension And Community Involvement",
      "weight": 4,
      "page": "area-6.html",
      "paramCount": 4,
      "leafTotal": 48
    },
    {
      "id": "area-7",
      "roman": "VII",
      "title": "Library",
      "weight": 5,
      "page": "area-7.html",
      "paramCount": 7,
      "leafTotal": 98
    },
    {
      "id": "area-8",
      "roman": "VIII",
      "title": "Physical Plant And Facilities",
      "weight": 3,
      "page": "area-8.html",
      "paramCount": 10,
      "leafTotal": 152
    },
    {
      "id": "area-9",
      "roman": "IX",
      "title": "Laboratories",
      "weight": 4,
      "page": "area-9.html",
      "paramCount": 4,
      "leafTotal": 49
    },
    {
      "id": "area-10",
      "roman": "X",
      "title": "Administration",
      "weight": 5,
      "page": "area-10.html",
      "paramCount": 8,
      "leafTotal": 118
    }
  ]
};
