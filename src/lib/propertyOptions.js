// Property feature catalogue used by the Add/Edit Property form and detail page.

export const PROPERTY_TYPES = ['Apartment block', 'Townhouse', 'Cottage', 'House', 'Commercial', 'Student housing', 'BnB / Lodge', 'Mixed use']

export const FURNISHED = ['Unfurnished', 'Part-furnished', 'Furnished']

export const UTILITIES_INCLUDED = ['Water', 'Electricity', 'WiFi', 'Refuse', 'Levy']

// Amenities grouped for tick-boxes. Stored as a flat array of keys.
export const AMENITY_GROUPS = [
  {
    group: 'Utilities', items: [
      ['borehole', 'Borehole'], ['water_tank', 'Water tank (JoJo)'], ['municipal_water', 'Municipal water'],
      ['solar', 'Solar power'], ['inverter', 'Inverter / battery backup'], ['generator', 'Generator'],
      ['zesa_prepaid', 'ZESA prepaid'], ['wifi', 'Fibre / WiFi'], ['geyser', 'Geyser'],
    ],
  },
  {
    group: 'Security', items: [
      ['durawall', 'Durawall'], ['electric_fence', 'Electric fence'], ['auto_gate', 'Automated gate'],
      ['cctv', 'CCTV'], ['guard', 'Security guard'], ['alarm', 'Alarm system'],
    ],
  },
  {
    group: 'Comfort & extras', items: [
      ['parking', 'Parking / garage'], ['pool', 'Swimming pool'], ['garden', 'Garden / yard'],
      ['aircon', 'Air conditioning'], ['balcony', 'Balcony / veranda'], ['bic', 'Built-in cupboards'],
      ['tiled', 'Tiled floors'], ['cottage', "Servant's quarters"], ['pets', 'Pets allowed'],
      ['wheelchair', 'Wheelchair access'], ['laundry', 'Laundry'],
    ],
  },
]

const LABELS = Object.fromEntries(AMENITY_GROUPS.flatMap((g) => g.items))
export function amenityLabel(key) { return LABELS[key] || key }
