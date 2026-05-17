class Tournament {
  constructor(id, name, source, city, state, date, level, price, registrationLink) {
    this.id = id;
    this.name = name;
    this.source = source;
    this.city = city;
    this.state = state;
    this.date = date;
    this.level = level;
    this.price = price;
    this.registrationLink = registrationLink;
  }
}

module.exports = Tournament;