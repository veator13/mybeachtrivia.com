// firebase-data.js — Last Laugh host data layer
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getFirestore,
  collection, doc,
  getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot,
  serverTimestamp,
  query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
  authDomain: "mybeachtrivia.com",
  projectId: "beach-trivia-website",
  storageBucket: "beach-trivia-website.appspot.com",
  messagingSenderId: "459479368322",
  appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
  measurementId: "G-24MQRKKDNY"
};

let _db, _auth;
(function boot() {
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  _db = getFirestore(app);
  _auth = getAuth(app);
  setPersistence(_auth, browserLocalPersistence).catch(() => {});
})();

let _authPromise = null;
function ensureAuth() {
  if (_authPromise) return _authPromise;
  _authPromise = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Not signed in. Please log in to host.')), 8000);
    const off = onAuthStateChanged(_auth, user => {
      if (user) { clearTimeout(t); off(); resolve(user); }
    });
  });
  return _authPromise;
}

// ─── Random Prompts ───────────────────────────────────────────────
const RANDOM_PROMPTS = [
  // ── Bad slogans & names ───────────────────────────────────────
  "A terrible slogan for a new seafood restaurant.",
  "A bad name for a new energy drink.",
  "The worst slogan for a gym.",
  "A terrible name for a retirement home.",
  "The worst possible name for a children's hospital.",
  "A bad name for a law firm.",
  "The worst slogan for a funeral home.",
  "A terrible name for a dating app.",
  "The worst slogan for a dentist's office.",
  "A bad name for a children's toy.",
  "The worst slogan for a mattress store.",
  "A terrible name for a hair salon.",
  "The worst slogan for a pet store.",
  "A bad name for a life insurance company.",
  "The worst slogan for a car dealership.",
  "A terrible name for a fast food chain.",
  "The worst slogan for a bank.",
  "A bad name for a daycare.",
  "The worst slogan for a moving company.",
  "A terrible name for a wine brand.",
  "The worst slogan for a hospital.",
  "A bad name for a hotel chain.",
  "The worst slogan for a pharmacy.",
  "A terrible name for a financial advisor firm.",
  "The worst slogan for a pizza place.",
  "A bad name for a ski resort.",
  "The worst slogan for a plumber.",
  "A terrible name for a bakery.",
  "The worst slogan for a pest control company.",
  "A bad name for a smoothie bar.",
  "The worst slogan for a tattoo parlor.",
  "A terrible name for a craft brewery.",
  "The worst slogan for a mental health clinic.",
  "A bad name for an airline.",
  "The worst slogan for a payday loan company.",
  "A terrible name for a candle company.",
  "The worst slogan for a children's dentist.",
  "A bad name for a karate school.",
  "The worst slogan for a hot dog cart.",
  "A terrible name for a couples' therapist.",
  "The worst slogan for a blood bank.",
  "A bad name for a spa.",
  "The worst slogan for an escape room.",
  "A terrible name for a sushi restaurant.",
  "The worst slogan for an optometrist.",
  "A bad name for a CrossFit gym.",
  "The worst slogan for a tanning salon.",
  "A terrible name for a vegan burger joint.",
  "The worst slogan for a colonoscopy clinic.",
  "A bad name for a luxury yacht rental.",

  // ── Worst things to say ───────────────────────────────────────
  "The worst thing to say to your boss on your first day.",
  "The worst thing to say at a job interview.",
  "The worst thing to say at a first date.",
  "The worst thing to say at a funeral.",
  "The worst thing to say at a wedding toast.",
  "The worst thing to say to a cop who pulled you over.",
  "The worst thing to say when meeting your partner's parents.",
  "The worst thing to say during a job performance review.",
  "The worst thing to say to a doctor before surgery.",
  "The worst thing to say when someone asks if you like their haircut.",
  "The worst thing to say when someone says 'I love you' for the first time.",
  "The worst thing to say when you show up late to a meeting.",
  "The worst thing to say when someone gives you a bad gift.",
  "The worst thing to say at a baby shower.",
  "The worst thing to say to your landlord.",
  "The worst thing to say right before a bungee jump.",
  "The worst thing to say at a job reference check.",
  "The worst thing to say on a zoom call when you don't know you're unmuted.",
  "The worst thing to say when breaking up with someone.",
  "The worst thing the pilot could announce mid-flight.",
  "The worst thing to hear from a surgeon mid-operation.",
  "The worst thing to say when someone asks 'does this dress make me look fat?'",
  "The worst thing a fortune cookie could say.",
  "The worst thing to say at your retirement party.",
  "The worst thing to hear from your Uber driver.",
  "The worst thing to say when someone shows you their new baby.",
  "The worst thing to say after losing a chess game.",
  "The worst thing a dentist could say right before they start drilling.",
  "The worst thing to say when someone shows you their engagement ring.",
  "The worst opening line on a dating profile.",

  // ── Advice & instructions ─────────────────────────────────────
  "The worst advice your doctor could give you.",
  "The worst advice a financial advisor could give.",
  "The worst advice for someone starting a diet.",
  "The worst advice for someone learning to drive.",
  "The worst advice a therapist could give.",
  "The worst advice for someone going through a breakup.",
  "The worst advice for a first-time homebuyer.",
  "The worst advice for someone going on a job interview.",
  "The worst advice for someone starting a business.",
  "The worst advice for someone learning to cook.",
  "The worst advice for someone trying to fall asleep.",
  "The worst advice for someone trying to make friends.",
  "The worst advice for someone training for a marathon.",
  "The worst piece of parenting advice.",
  "The worst advice for someone planning a wedding.",
  "The worst advice for a new pet owner.",
  "The worst advice for someone moving to a new city.",
  "The worst life advice to put in a graduation speech.",
  "The worst advice for someone asking for a raise.",
  "The worst survival tip for being stranded on a desert island.",

  // ── Signs & notices ───────────────────────────────────────────
  "A sign you'd never want to see at a hotel.",
  "A sign you'd never want to see at a restaurant.",
  "A sign you'd never want to see at the doctor's office.",
  "A sign you'd never want to see at a daycare.",
  "A sign you'd never want to see at a tattoo parlor.",
  "A sign you'd never want to see at a sushi bar.",
  "A sign you'd never want to see at a gas station.",
  "A sign you'd never want to see at an airport.",
  "A sign you'd never want to see at a bank.",
  "A sign you'd never want to see at a casino.",
  "A sign you'd never want to see at a barbershop.",
  "A sign you'd never want to see at a pharmacy.",
  "A sign you'd never want to see at a parachute rental place.",
  "A sign you'd never want to see at a hospital.",
  "A sign you'd never want to see at a swimming pool.",
  "A sign you'd never want to see at a theme park.",
  "A sign you'd never want to see at a car mechanic.",
  "A sign you'd never want to see at a law office.",
  "A sign you'd never want to see at a kindergarten.",
  "A sign you'd never want to see at a water park.",

  // ── What's actually happening ─────────────────────────────────
  "What a cat is actually thinking during a vet visit.",
  "What your dog is actually thinking when you leave for work.",
  "What a goldfish thinks about all day.",
  "What the tooth fairy actually does with your teeth.",
  "What Santa's elves complain about in their off time.",
  "What pigeons are actually talking about.",
  "What your houseplants would say if they could talk.",
  "What your Roomba thinks about your house.",
  "What squirrels are actually planning.",
  "What cows think about as they stand in a field.",
  "What your GPS is actually thinking when you ignore it.",
  "What the mannequins think after the store closes.",
  "What office printers think about their jobs.",
  "What vending machines are really feeling.",
  "What a sloth thinks when it's in a hurry.",
  "What your phone thinks about you based on your search history.",
  "What airport security is actually thinking.",
  "What the elevator thinks about the people who ride it.",
  "What a traffic cone thinks about its life.",
  "What your scale is thinking every January.",
  "What your WiFi router thinks about you.",
  "What a treadmill thinks about people who hang clothes on it.",
  "What the last french fry in the bag is thinking.",
  "What a fire hydrant thinks about its job.",
  "What your alarm clock thinks about you.",

  // ── Rejected & bad ideas ──────────────────────────────────────
  "A rejected superhero power.",
  "A rejected Olympic sport.",
  "A rejected name for a superhero.",
  "A rejected product that was almost sold at Walmart.",
  "A rejected motto for the United States.",
  "A rejected children's book title.",
  "A rejected Hallmark movie plot.",
  "A rejected flavor of Gatorade.",
  "A rejected name for a planet.",
  "A rejected superhero sidekick.",
  "A rejected Monopoly game piece.",
  "A rejected candy bar name.",
  "A rejected name for a month of the year.",
  "A rejected slogan for the Olympics.",
  "A rejected Disney princess.",
  "A rejected James Bond movie title.",
  "A rejected name for a boy band.",
  "A rejected item on the McDonald's secret menu.",
  "A rejected name for a new country.",
  "A rejected motivational poster slogan.",
  "A rejected name for a social media platform.",
  "A rejected app idea that somehow got $10 million in funding.",
  "A rejected name for a new color.",
  "A rejected Scrabble word that should be real.",
  "A rejected name for a national holiday.",

  // ── Completions ───────────────────────────────────────────────
  "Complete this sentence: 'You know you're at a bad party when...'",
  "Complete this sentence: 'I knew it was going to be a bad day when...'",
  "Complete this sentence: 'The doctor looked concerned when I told him...'",
  "Complete this sentence: 'I regret eating...'",
  "Complete this sentence: 'My GPS told me to...'",
  "Complete this sentence: 'The last thing I expected to find in my attic was...'",
  "Complete this sentence: 'I lost my job because...'",
  "Complete this sentence: 'My New Year's resolution lasted exactly...'",
  "Complete this sentence: 'The weirdest thing my neighbor does is...'",
  "Complete this sentence: 'I once told my boss that...'",
  "Complete this sentence: 'My Tinder bio should just say...'",
  "Complete this sentence: 'I knew the restaurant was bad when...'",
  "Complete this sentence: 'My pet's one job is to...'",
  "Complete this sentence: 'Nobody warned me that marriage would involve so much...'",
  "Complete this sentence: 'The smell in my car is because...'",
  "Complete this sentence: 'My gym membership is best used as...'",
  "Complete this sentence: 'On my tombstone, please write...'",
  "Complete this sentence: 'I stopped going to that doctor when...'",
  "Complete this sentence: 'My Wikipedia page would just say...'",
  "Complete this sentence: 'The most confusing part of adulting is...'",
  "Complete this sentence: 'Nobody told me that having kids meant...'",
  "Complete this sentence: 'I knew the hotel was bad when...'",
  "Complete this sentence: 'The most honest thing on my resume is...'",
  "Complete this sentence: 'My spirit animal is a _____ because...'",
  "Complete this sentence: 'At 3am, I'm usually...'",

  // ── Would you rather / hypotheticals ─────────────────────────
  "The strangest thing you could add to a pizza.",
  "Something you'd find in a haunted house that's more annoying than scary.",
  "The worst superpower to have at the beach.",
  "Something that sounds relaxing but isn't.",
  "Something that should be illegal but isn't.",
  "Something that shouldn't be as satisfying as it is.",
  "Something that's technically legal but definitely shouldn't be at a pool party.",
  "The most passive-aggressive thing you could put in a work email.",
  "Something that would immediately ruin a first date.",
  "The worst thing to find in your hotel room's minibar.",
  "Something a pirate would say instead of 'Arrr'.",
  "The worst thing to discover mid-flight.",
  "Something you'd find suspicious about a house listing.",
  "The worst activity for a team-building event.",
  "Something you'd regret ordering at a gas station.",
  "The worst icebreaker for a work meeting.",
  "Something you'd see in a very honest Airbnb listing.",
  "The worst thing to discover about a used car you just bought.",
  "Something that sounds fancy but is actually disgusting.",
  "The most passive-aggressive gift to give your nemesis.",

  // ── Professions & roles ───────────────────────────────────────
  "What a lazy lifeguard's job description would say.",
  "What a lazy teacher puts on the syllabus.",
  "The job duties of a professional procrastinator.",
  "What would be on a pirate's LinkedIn profile.",
  "What a mall Santa's Glassdoor review would say.",
  "What a vampire's morning routine looks like.",
  "What a haunted house ghost writes in their performance review.",
  "What the Easter Bunny does in the off-season.",
  "What a referee thinks about during a really boring game.",
  "What a zoo janitor's least favorite day is.",
  "What a weather forecaster says when they're just guessing.",
  "What a lifeguard at a kiddie pool thinks about all day.",
  "What a professional taste tester's sick day note says.",
  "What the stunt double thinks on a slow day.",
  "The LinkedIn headline of someone who's given up.",
  "What a terrible tour guide would say at the Grand Canyon.",
  "What the night shift security guard at a wax museum does.",
  "What a motivational speaker says when they're having a bad day.",
  "What's really in the chef's 'secret sauce.'",
  "What a hotel concierge actually thinks when you ask a dumb question.",

  // ── Inventions & products ─────────────────────────────────────
  "The world's least useful invention.",
  "A product that exists but really shouldn't.",
  "A Kickstarter idea that would definitely fail.",
  "An As Seen on TV product that's completely useless.",
  "The worst possible app idea.",
  "An invention that solves a problem nobody has.",
  "A product you could sell to people who have too much money.",
  "The worst flavor of a popular snack.",
  "A subscription box nobody asked for.",
  "The worst addition to a Swiss Army knife.",
  "A product that would only sell in one very specific situation.",
  "The worst thing to put in a kids' meal toy.",
  "An IKEA product with a terrible name.",
  "The worst thing to find on a restaurant's QR code menu.",
  "A terrible feature for a self-driving car.",
  "An Amazon product with a one-star review that makes sense.",
  "The worst optional add-on at a fast food restaurant.",
  "A product that should have warning labels but doesn't.",
  "The worst possible smart home device.",
  "A terrible idea for a Netflix original series.",

  // ── Beach / bar / trivia night specific ──────────────────────
  "The worst thing to find in your beach bag.",
  "A terrible excuse for not tipping.",
  "The worst beach safety rule nobody follows.",
  "What the bar bathroom graffiti says at a really bad bar.",
  "The worst order you could place at a tiki bar.",
  "What a seagull would order at a bar.",
  "The worst thing to yell at a trivia night.",
  "A terrible name for a beach-themed cocktail.",
  "What the sand thinks about people who sit on it.",
  "The worst beach umbrella design.",
  "A sign you should leave a bar immediately.",
  "The worst 'fun fact' to share at trivia night.",
  "A terrible icebreaker for a beach bar.",
  "The most suspicious thing in a beach town's lost and found.",
  "What's really inside a seashell you pick up.",
  "The worst song to play at a beach bar.",
  "The worst thing to bring to a potluck.",
  "A terrible trivia category nobody wants.",
  "What the bartender is actually thinking when you order a complicated drink.",
  "The most passive-aggressive thing to put on a tip receipt.",

  // ── Relationships & social life ────────────────────────────────
  "The worst thing to text someone after a bad first date.",
  "The most suspicious thing to find in a significant other's browser history.",
  "The worst nickname to call your partner in public.",
  "A terrible reason to cancel plans.",
  "What your friend group's group chat is secretly named.",
  "The worst excuse for forgetting a friend's birthday.",
  "The most awkward thing to accidentally like on someone's Instagram.",
  "The worst topic to bring up at Thanksgiving dinner.",
  "The most passive-aggressive way to deal with a loud neighbor.",
  "A terrible pick-up line that someone has definitely used.",
  "The worst possible wedding theme.",
  "What a very honest wedding vow would say.",
  "A terrible name for a couples' podcast.",
  "The worst thing to say after 'I do.'",
  "The most suspicious activity on a joint bank account.",
  "What your coworker's body language is really saying in a meeting.",
  "A terrible reason to break up with someone.",
  "The most passive-aggressive response to 'we need to talk.'",
  "What would really be on a couples' matching tattoo.",
  "The worst double date idea.",

  // ── Food & dining ─────────────────────────────────────────────
  "Something you'd never want to find in your burrito.",
  "The worst item on a gas station sushi menu.",
  "A terrible food combination that someone definitely eats.",
  "The worst description of a dish on a pretentious menu.",
  "What's really in a 'mystery meat' dish.",
  "A food that sounds disgusting but is considered a delicacy.",
  "The worst item you could find at a potluck.",
  "A terrible Yelp review for a restaurant that deserved it.",
  "What an honest nutrition label would say.",
  "The worst flavor of a protein bar.",
  "What's actually in a 'secret recipe.'",
  "The worst thing to serve at a five-star restaurant.",
  "A food that should not be turned into a smoothie but has been.",
  "The most pretentious way to describe a grilled cheese.",
  "A terrible substitution at a restaurant for someone with allergies.",
  "The worst thing to find in a birthday cake.",
  "What the soup of the day really is.",
  "The most confusing item on a fusion restaurant menu.",
  "A terrible thing to name a salad.",
  "The worst dish to bring to a fancy dinner party.",

  // ── Animals ───────────────────────────────────────────────────
  "What a golden retriever thinks about during a car ride.",
  "What a seagull's life goal is.",
  "What a lazy panda thinks about all day.",
  "What a raccoon's New Year's resolution is.",
  "What a flamingo is always thinking about.",
  "What a dolphin's grievance is with humans.",
  "What a bear's Yelp review of a campsite would say.",
  "What an octopus finds most annoying about having eight arms.",
  "What a penguin does on its day off.",
  "What a llama's biggest personality flaw is.",
  "What a housefly's bucket list includes.",
  "What a hamster thinks about its wheel.",
  "What a parrot does when nobody's watching.",
  "What a turtle thinks about fast walkers.",
  "What a gorilla's job application says.",
  "What a shark's therapy session focuses on.",
  "What a cat tweets about humans.",
  "What a dog's podcast would be called.",
  "What a cow thinks about when it moos.",
  "What a horse thinks about the people who ride it.",
  "What a pigeon thinks when it looks at a statue.",
  "What a squirrel's financial plan looks like.",
  "What a snail's motivational speech says.",
  "What an ant thinks about a picnic.",
  "What a porcupine thinks about hugs.",

  // ── Modern life & tech ─────────────────────────────────────────
  "What your phone is actually thinking about you.",
  "A terms and conditions agreement nobody actually reads.",
  "What Siri says when she's judging you.",
  "The worst possible two-factor authentication question.",
  "What your spam folder says about you as a person.",
  "The least helpful error message a computer can show.",
  "What happens inside a WiFi router when you unplug it.",
  "The worst possible password hint.",
  "What your Amazon Alexa thinks of your music taste.",
  "A terrible update feature for a smartphone.",
  "What your car's check engine light actually means.",
  "The worst tech support response of all time.",
  "What a Roomba thinks after cleaning your house.",
  "What your smart refrigerator is judging you for.",
  "The worst possible auto-correct suggestion.",
  "What your Netflix algorithm thinks about you.",
  "The most passive-aggressive 'read receipt' situation.",
  "What an AI writes when asked to be 'more human.'",
  "The worst notification to get on your phone.",
  "What a self-checkout machine thinks about people who use it.",
  "The most confusing IKEA instruction step.",
  "What Google's search suggestions say about society.",
  "The worst possible voice assistant name.",
  "A terrible feature for a smart TV remote.",
  "What your browser's incognito mode is actually hiding.",

  // ── Travel & adventure ─────────────────────────────────────────
  "The most passive-aggressive thing to write on a hotel comment card.",
  "What a very honest travel brochure would say.",
  "The worst souvenir from any country.",
  "What a tour guide says when they're completely lost.",
  "The most suspicious item in airport security.",
  "The worst possible carry-on item.",
  "What flight turbulence is really caused by.",
  "The most passive-aggressive way to recline your airplane seat.",
  "What a cruise ship's lost and found really contains.",
  "The worst Airbnb 'quirk' listed in the description.",
  "A terrible travel hack that sounds good but isn't.",
  "What the hotel minibar is really judging you for.",
  "The worst possible in-flight movie.",
  "What the baggage carousel is thinking.",
  "A terrible reason to pack only a carry-on.",
  "The most suspicious thing in a vacation photo.",
  "What a customs agent is really thinking.",
  "The worst travel companion habit.",
  "A terrible thing to say to the person next to you on a long flight.",
  "What the hotel 'do not disturb' sign really means.",

  // ── Sports & fitness ──────────────────────────────────────────
  "The worst pep talk a coach could give at halftime.",
  "The least motivating gym T-shirt slogan.",
  "The worst thing to yell at a youth soccer game.",
  "What a sports commentator says when nothing's happening.",
  "The most passive-aggressive thing to say at a friendly game of golf.",
  "The worst trophy you could win.",
  "What a marathon runner thinks at mile 20.",
  "The least useful thing to put in a gym bag.",
  "The worst exercise to do in public.",
  "What a yoga instructor thinks about people who fall asleep in class.",
  "The worst team name for a company softball team.",
  "What a referee whispers to players to mess with them.",
  "A terrible chant for a sports team.",
  "The most suspicious score in a sport.",
  "What a golf course thinks about its players.",
  "The worst time to ask 'are we there yet?' during a marathon.",
  "What a treadmill thinks after someone uses it for 5 minutes.",
  "The worst way to celebrate a win.",
  "A terrible new rule to add to basketball.",
  "What a peewee league trophy says to the last-place team.",

  // ── Pop culture & entertainment ───────────────────────────────
  "A terrible sequel to a beloved movie.",
  "The worst possible Netflix show premise.",
  "What a reality TV show about accountants would look like.",
  "The least interesting documentary subject.",
  "A terrible plot twist in a romantic comedy.",
  "The worst celebrity endorsement deal.",
  "What a movie critic says about the worst film ever made.",
  "A terrible theme for a superhero movie reboot.",
  "The least exciting video game concept.",
  "What a boring magician's signature trick is.",
  "The worst possible karaoke song choice.",
  "A terrible new dance craze.",
  "What a very honest movie trailer would say.",
  "The worst possible child's birthday party theme.",
  "A rejected name for a Marvel superhero.",
  "The worst band name that somehow got famous.",
  "What the worst YouTube channel is about.",
  "A terrible idea for a spin-off show.",
  "The most passive-aggressive movie title.",
  "What a very honest Oscars acceptance speech sounds like.",

  // ── Holidays & occasions ──────────────────────────────────────
  "The worst possible Secret Santa gift.",
  "What a very honest Christmas card would say.",
  "The most passive-aggressive Easter egg hiding spot.",
  "The worst New Year's Eve plan.",
  "What a very honest Valentine's Day card says.",
  "A terrible thing to carve on a pumpkin.",
  "The worst July 4th fireworks description.",
  "What a very honest Mother's Day card would say.",
  "A terrible thing to put in a piñata.",
  "The worst birthday cake flavor combo.",
  "The most passive-aggressive way to celebrate Thanksgiving.",
  "A terrible Halloween costume explanation.",
  "What a very honest graduation speech would say.",
  "The worst item in a holiday gift basket.",
  "A terrible reason to throw a party.",
  "The worst party game idea.",
  "What the Easter Bunny actually thinks about the job.",
  "A terrible New Year's resolution that someone actually kept.",
  "The worst thing to say when blowing out birthday candles.",
  "What Santa writes in his HR complaint.",

  // ── School & work ─────────────────────────────────────────────
  "The worst excuse for missing a work deadline.",
  "What a very honest resume would say.",
  "The worst team name for a work trivia team.",
  "What a passive-aggressive coworker writes in their email signature.",
  "The most suspicious Google search from a work computer.",
  "What a very honest LinkedIn 'about me' says.",
  "The worst thing to put on your out-of-office message.",
  "A terrible icebreaker for a new team meeting.",
  "What a passive-aggressive boss writes on a sticky note.",
  "The worst thing to say in a performance review.",
  "A terrible idea for a company retreat.",
  "The most useless skill to put on a resume.",
  "What a teacher's comment on a report card really means.",
  "The worst possible thesis statement.",
  "A terrible subject line for a work email.",
  "What a very honest job posting would say.",
  "The worst zoom background choice for a serious meeting.",
  "A terrible PowerPoint slide transition.",
  "What the break room fridge is really judging people for.",
  "The most passive-aggressive office sign.",
  "What a professor writes in their course notes after a bad class.",
  "The worst possible group project dynamic.",
  "What a very honest syllabus would say.",
  "A terrible name for a work policy.",
  "The most suspicious thing to expense on a company card.",

  // ── Health & body ─────────────────────────────────────────────
  "The worst medical advice from a WebMD search.",
  "What a very honest health app would tell you.",
  "The worst thing to see on a hospital menu.",
  "What your doctor thinks when you describe your symptoms.",
  "A terrible name for a new diet.",
  "The most passive-aggressive thing a nurse could say.",
  "What a very honest calorie label would say.",
  "The worst workout motivation poster.",
  "A terrible new wellness trend.",
  "What your body says when you skip the gym for a month.",
  "The most misleading thing on a nutrition label.",
  "A terrible remedy your grandma swears by.",
  "What an honest Fitbit notification would say.",
  "The worst way to recover from a cold.",
  "What a very honest personal trainer thinks.",
  "The most suspicious ingredient in a 'superfood' smoothie.",
  "A terrible name for a new prescription drug.",
  "What the scale thinks after the holidays.",
  "The least effective fitness tip ever given.",
  "What a very honest sleep tracker report says.",

  // ── Nature & environment ──────────────────────────────────────
  "What a very honest weather forecast sounds like.",
  "What the ocean thinks about people who visit the beach.",
  "What a volcano thinks right before it erupts.",
  "What rain thinks when people complain about it.",
  "What a national park's honest review of its visitors says.",
  "What the moon thinks about its job.",
  "What a hurricane's Yelp review of a city would say.",
  "What a thunderstorm thinks about people who are scared of it.",
  "What the Grand Canyon thinks about tourists.",
  "What a tree in a city park thinks about its life.",
  "What clouds do when nobody's watching.",
  "What the sun thinks about sunscreen.",
  "What a glacier thinks about people who take photos of it.",
  "What a mountain thinks about people who climb it.",
  "What a river thinks about kayakers.",
  "What a tornado thinks about storm chasers.",
  "What a cactus thinks about being in someone's apartment.",
  "What the desert thinks about people who say 'but it's a dry heat.'",
  "What grass thinks when people don't stay off it.",
  "What a very honest winter weather advisory says.",

  // ── History & culture ─────────────────────────────────────────
  "What ancient Romans would think about modern fast food.",
  "What dinosaurs would say if they could leave a review of Earth.",
  "What a pirate's Amazon Prime account order history looks like.",
  "What the Mona Lisa is actually thinking.",
  "What Napoleon's therapy notes would say.",
  "What a medieval knight's Tinder profile would say.",
  "What George Washington's Yelp review of Valley Forge would be.",
  "What Shakespeare would write about modern social media.",
  "What the Leaning Tower of Pisa's building permit application says.",
  "What a viking's travel blog would look like.",
  "What Cleopatra's skincare routine instructions actually say.",
  "What a caveman's first Yelp review would be.",
  "What Leonardo da Vinci's to-do list says.",
  "What a gladiator's gym membership contract says.",
  "What aliens think when they look at Earth's satellite TV channels.",
  "What the Sphinx is really thinking.",
  "What a medieval plague doctor's business card says.",
  "What Columbus's GPS would have said.",
  "What an ancient Roman's 'hot takes' on modern plumbing would be.",
  "What Stonehenge's honest construction review says.",

  // ── Random & weird ─────────────────────────────────────────────
  "The strangest item in a time capsule buried in 2024.",
  "What's really inside a black hole.",
  "The most suspicious thing to find in a used car's glove box.",
  "What a very honest magic 8-ball would say.",
  "The worst thing to discover in a storage unit auction.",
  "What an honest horoscope would actually predict.",
  "The most passive-aggressive way to say hello.",
  "What a vending machine says when you kick it.",
  "The worst thing to discover about your house after moving in.",
  "What your shadow is thinking.",
  "A terrible reason to call 911.",
  "What your reflection actually thinks of you.",
  "The most suspicious thing to say to a stranger on an elevator.",
  "What happens to all the lost socks.",
  "The worst possible last words.",
  "What a very honest mirror would say.",
  "The most suspicious item in a yard sale.",
  "What a 'CAUTION: WET FLOOR' sign is really warning you about.",
  "What happens at 3am that nobody talks about.",
  "A terrible fortune to find in a fortune cookie.",
  "What a door thinks about people who walk through it.",
  "The most suspicious item in a lost and found.",
  "What a chair thinks about people who sit on it.",
  "The worst thing to discover about a house after signing the lease.",
  "What a very honest horoscope for Gemini says.",
  "What a parking meter thinks about its job.",
  "The most suspicious thing inside a piñata.",
  "What a very honest Magic 8-Ball says.",
  "The worst thing written in a guestbook.",
  "What the void thinks about when you stare into it.",

  // ── More bad slogans & names ──────────────────────────────────
  "A terrible slogan for a sunscreen brand.",
  "The worst possible name for a new political party.",
  "A bad name for a discount airline.",
  "The worst slogan for a grocery store.",
  "A terrible name for a children's menu at a bar.",
  "The worst slogan for a parachute company.",
  "A bad name for a marriage counseling service.",
  "The worst slogan for a sleep clinic.",
  "A terrible name for a budget hotel chain.",
  "The worst slogan for a cleaning company.",
  "A bad name for a senior living community.",
  "The worst slogan for a tax preparation service.",
  "A terrible name for a medical marijuana dispensary.",
  "The worst slogan for a water park.",
  "A bad name for a dog grooming service.",
  "The worst slogan for a chiropractor.",
  "A terrible name for a weight loss program.",
  "The worst slogan for a cemetery.",
  "A bad name for a craft kombucha company.",
  "The worst slogan for a lobster restaurant.",

  // ── What would X say ──────────────────────────────────────────
  "What would a disappointed dad say to a robot?",
  "What would a helicopter parent say to a college professor?",
  "What would a passive-aggressive roommate write in a shared apartment notebook?",
  "What would a very tired nurse say as an out-of-office reply?",
  "What would an overworked elf say to Santa after December?",
  "What would a very honest realtor say about a bad house?",
  "What would a ghost say on its first day haunting a house?",
  "What would a bored astronaut post from the space station?",
  "What would a very confident but unqualified chef say on a cooking show?",
  "What would a disappointed time traveler say after visiting 2025?",
  "What would a sad mime's therapist report say?",
  "What would a burned-out wizard say at a magic convention?",
  "What would a very honest matchmaker say to their client?",
  "What would a seagull's Glassdoor review of the beach say?",
  "What would a jaded genie say after granting one too many wishes?",
  "What would a very sarcastic GPS say in traffic?",
  "What would a passive-aggressive dentist write in their office newsletter?",
  "What would a very honest restaurant health inspector report say?",
  "What would a disappointed guardian angel say about their assigned human?",
  "What would a very tired Santa write in his diary on December 26th?",

  // ── Worst things to hear/find/see ─────────────────────────────
  "The worst thing to see on a cruise ship announcement board.",
  "The worst thing to discover on page 2 of a contract you already signed.",
  "The worst thing to see on a buffet sneeze guard.",
  "The worst thing to find on a used mattress.",
  "The worst thing to hear during a timeshare presentation.",
  "The worst thing a mechanic says when they're done with your car.",
  "The worst thing to read on a spa menu.",
  "The worst text to receive from your landlord at 9pm.",
  "The worst thing to see on a restaurant's open kitchen wall.",
  "The worst thing printed on the inside of a wedding ring.",
  "The worst thing to find in the freezer of a house you just bought.",
  "The worst thing a bridesmaid could say at the rehearsal dinner.",
  "The worst thing to see on a business card.",
  "The worst thing to discover during an already-uncomfortable massage.",
  "The worst thing to read on a cereal box prize.",
  "The worst thing to see on a real estate listing photo.",
  "The worst thing a babysitter could text.",
  "The worst thing to find under a restaurant table.",
  "The worst thing printed on a hospital wristband.",
  "The worst thing a vet could say when you bring in your pet.",

  // ── Job titles & descriptions ─────────────────────────────────
  "A job title that sounds important but isn't.",
  "The worst job responsibility to add to someone's role without a raise.",
  "The least convincing job title on a resume.",
  "A fake department that somehow exists at every office.",
  "The most passive-aggressive way to describe your job at a party.",
  "The least glamorous thing about being a movie star.",
  "The worst skill listed under 'proficient in' on a resume.",
  "A job that sounds fun until you actually do it.",
  "The worst reason someone would get promoted.",
  "The least helpful person at any company.",
  "The most suspicious reason to call in sick.",
  "A job listing that's technically legal but ethically questionable.",
  "The worst 'fun perk' a company advertises.",
  "The most passive-aggressive thing in an employee handbook.",
  "What 'unlimited PTO' really means in practice.",
  "The worst possible 'casual Friday' policy.",
  "A workplace rule that makes everyone miserable.",
  "The least effective thing a manager can say to motivate their team.",
  "The worst 'motivational' email a boss could send on a Monday.",
  "The most suspicious reason to schedule a 'quick sync' at 4:55pm.",

  // ── True/false style humor ─────────────────────────────────────
  "The most honest thing anyone has ever said at a HOA meeting.",
  "The most honest thing ever printed on a gym towel.",
  "The most honest thing a pizza delivery driver has ever thought.",
  "The most honest thing written on a gym locker.",
  "The most honest post-it note ever left on an office fridge.",
  "The most honest thing a parking enforcement officer has ever thought.",
  "The most honest Airbnb house rule.",
  "The most honest thing ever said at a timeshare meeting.",
  "The most honest thing written in a visitors' book at a museum.",
  "The most honest reason to call in sick.",
  "The most honest customer feedback card.",
  "The most honest reason anyone has ever been fired.",
  "The most honest vacation souvenir.",
  "The most honest response to 'how are you doing?'",
  "The most honest thing ever written in a college admissions essay.",
  "The most honest motivational quote.",
  "The most honest reason to unfriend someone.",
  "The most honest warranty card response.",
  "The most honest thing a personal trainer has ever thought.",
  "The most honest job application answer.",

  // ── Hypothetical scenarios ────────────────────────────────────
  "If dogs ran the government, the first law they'd pass.",
  "If cats designed apartments, what would be different.",
  "If toddlers ran a restaurant, what would be on the menu.",
  "If your pet wrote your performance review.",
  "If traffic cones could protest, what their signs would say.",
  "If pigeons had a union, their first demand.",
  "If Monday was a person, what they'd be like at a party.",
  "If your liver could file a complaint, what it would say.",
  "If staplers went on strike, what their demands would be.",
  "If elevators had Yelp reviews.",
  "If fast food chains had a spelling bee, who would win.",
  "If your immune system had a name and a personality.",
  "If parking lots had reality shows.",
  "If jury duty had a theme song.",
  "If couches had feelings.",
  "If WiFi outages had press conferences.",
  "If office chairs had union reps.",
  "If dentists greeted you the way bartenders do.",
  "If alarm clocks could talk back.",
  "If your mattress could rate you as a customer.",
  "If social media existed in the Stone Age.",
  "If snacks had job titles.",
  "If traffic had a mascot.",
  "If naps were a currency.",
  "If Mondays were banned, what people would call Tuesday.",

  // ── Pop-culture mashups ───────────────────────────────────────
  "A crossover between a cooking show and a courtroom drama.",
  "What a nature documentary about suburbia would say.",
  "The pitch for a reality show nobody asked for.",
  "A terrible premise for a buddy cop movie.",
  "The world's least exciting action movie plot.",
  "A rom-com plot that makes no sense.",
  "The worst possible spin-off from a beloved sitcom.",
  "A children's book that should definitely not exist.",
  "The worst theme for a museum exhibit.",
  "A documentary subject so boring it would break Netflix.",
  "The worst possible reunion tour name.",
  "A video game level nobody would want to play.",
  "The most boring superhero origin story.",
  "The worst possible band name for a genre mashup.",
  "A TV show that explains everything wrong with society.",
  "The worst possible film festival category.",
  "A podcast that would cause people to fall asleep instantly.",
  "The worst Jeopardy category of all time.",
  "The most passive-aggressive way to describe a movie you hated.",
  "An award show category that should be retired forever.",

  // ── More food & dining ─────────────────────────────────────────
  "The worst possible pairing on a tasting menu.",
  "What a food critic says about the worst meal they've ever had.",
  "The least appetizing way to describe a perfectly good dish.",
  "A food trend from 2025 that future generations will judge.",
  "The worst thing about a $30 cocktail.",
  "What an honest Michelin star review would say.",
  "The worst thing a restaurant could name their 'chef's special.'",
  "What the 'locally sourced' thing on the menu is actually sourced from.",
  "The most passive-aggressive thing a waiter could say.",
  "What happens to leftover birthday cake at a restaurant.",
  "The least impressive thing to find in a 'charcuterie' board.",
  "The worst wedding cake flavor combination.",
  "What would be printed on very honest hot sauce labels.",
  "The most suspicious ingredient in a fancy cocktail.",
  "A food safety warning that would ruin your appetite.",
  "The worst possible dish to serve at an outdoor summer party.",
  "What an honest 'farm to table' restaurant really means.",
  "The most disappointing thing to find in a 'mystery bag' at a bakery.",
  "The worst possible response to 'table for two?'",
  "What the 'complimentary bread' is really trying to accomplish.",

  // ── More travel ───────────────────────────────────────────────
  "The worst thing printed on a tourist T-shirt.",
  "A travel hack that makes everything worse.",
  "The least useful thing in a hotel room.",
  "What the hotel shower pressure is really trying to tell you.",
  "The most confusing check-in process ever.",
  "What a very honest tour package brochure says in the fine print.",
  "The worst thing to realize about your hotel after check-in.",
  "The most misleading thing in a travel review.",
  "The least convincing 'tropical paradise' description.",
  "What the hotel pool is actually sharing with you.",
  "The most passive-aggressive way to leave a hotel room.",
  "The worst complimentary breakfast item.",
  "What a very honest passport stamp would say.",
  "The most suspicious thing about a 'five-star' resort.",
  "The least romantic thing about a romantic getaway.",
  "What a flight's 'complimentary snack' is really worth.",
  "The worst possible response to 'how was your vacation?'",
  "What a very honest travel vlogger says off camera.",
  "The most overrated tourist attraction in any country.",
  "The least convincing 'hidden gem' in a travel guide.",

  // ── Weird hypothetical jobs ────────────────────────────────────
  "What a professional line-stander complains about most.",
  "What a golf ball diver thinks about at the bottom of the pond.",
  "What a professional bridesmaid's worst client story is.",
  "What a snake milker's business card says.",
  "What a chicken sexer puts on their LinkedIn.",
  "What a professional mourner's Glassdoor review says.",
  "What a full-time Netflix tagger watches in their off hours.",
  "What a professional sleeper's morning routine looks like.",
  "What a deodorant tester's health insurance covers.",
  "What a pet food taster actually thinks about their job.",
  "What a professional apology writer says when they mess up.",
  "What a professional bridegroom planner charges extra for.",
  "What a human scarecrow does when nobody's looking.",
  "What a professional gift wrapper hates most.",
  "What a furniture tester thinks about their best and worst models.",

  // ── Oddly specific humor ──────────────────────────────────────
  "What the world's most passive-aggressive sticky note says.",
  "What a raccoon writes in its diary.",
  "The one thing you should never Google at work.",
  "What would make a great name for a mediocre superhero team.",
  "The worst item to bring to show-and-tell.",
  "What a very small font on a contract is hiding.",
  "The one thing that makes adults feel most like children.",
  "The worst possible plot twist for a cooking show.",
  "What the little voice in your head says at 2am.",
  "The most passive-aggressive umbrella at a lost and found.",
  "What the world's worst life coach charges per session.",
  "The least convincing reason someone uses to justify a large purchase.",
  "What would make a 'cozy mystery' novel completely uncozy.",
  "The worst thing a self-help book could tell you.",
  "The one thing that would instantly ruin a spa day.",
  "What the most annoying person on an airplane is thinking.",
  "The worst wedding gift registry item.",
  "The thing every bad roommate does but never admits.",
  "The least impressive 'party trick' anyone can do.",
  "What the worst high school reunion name tag says.",

  // ── More completions ──────────────────────────────────────────
  "Complete this sentence: 'I knew it was a bad Airbnb when...'",
  "Complete this sentence: 'My coworker's most annoying habit is...'",
  "Complete this sentence: 'The last thing I Googled was embarrassing because...'",
  "Complete this sentence: 'My excuse for not going to the gym is...'",
  "Complete this sentence: 'The weirdest thing I've ever ordered online was...'",
  "Complete this sentence: 'I realized I was getting old when...'",
  "Complete this sentence: 'My dating app profile should really say...'",
  "Complete this sentence: 'The real reason I was late is...'",
  "Complete this sentence: 'I panicked when the doctor said...'",
  "Complete this sentence: 'My spirit animal is definitely _____ because...'",
  "Complete this sentence: 'I spent three hours on the internet looking up...'",
  "Complete this sentence: 'The most questionable thing in my fridge right now is...'",
  "Complete this sentence: 'I once convinced myself that eating _____ was healthy.'",
  "Complete this sentence: 'The weirdest text I've ever sent was...'",
  "Complete this sentence: 'I've been banned from _____ and I'm not proud of it.'",
  "Complete this sentence: 'My last browser tab is embarrassing because...'",
  "Complete this sentence: 'The worst decision I've made at a buffet was...'",
  "Complete this sentence: 'I still don't fully understand...'",
  "Complete this sentence: 'My most questionable life hack is...'",
  "Complete this sentence: 'The biggest lie I tell myself is...'",

  // ── More pop culture ──────────────────────────────────────────
  "What a very honest Oscar speech sounds like after losing three times.",
  "The worst celebrity ghost writer confession.",
  "What a reality TV producer tells contestants that never airs.",
  "The least motivating TV show theme song for a Monday morning.",
  "A terrible sequel nobody asked for but Hollywood made anyway.",
  "The least romantic thing about a romantic movie's plot.",
  "What a video game NPC thinks when you keep talking to them.",
  "The worst possible collab between two brands.",
  "What the live studio audience actually thinks during a bad sitcom taping.",
  "The worst celebrity perfume name.",
  "A terrible name for a Netflix true crime series.",
  "The most boring possible plot for an action movie.",
  "The least convincing movie villain motivation.",
  "What a very honest movie trailer for a bad film would say.",
  "The worst possible theme for a cooking competition.",
  "What an influencer's manager says that never makes the post.",
  "The least exciting YouTube video concept that somehow got millions of views.",
  "What a reality star writes in their tell-all book's acknowledgements.",
  "The worst collab album concept.",
  "What the opening night review of the worst Broadway show says.",

  // ── More random weirdness ──────────────────────────────────────
  "The most confusing instruction on a shampoo bottle.",
  "What a very tired stork thinks about its job.",
  "The worst thing to hear right before a roller coaster drops.",
  "What a restroom's 'employees must wash hands' sign really means.",
  "The most passive-aggressive way to return a neighbor's borrowed item.",
  "The worst product placement in a movie.",
  "What your ice cube tray is thinking.",
  "A terrible sequel to a beloved nursery rhyme.",
  "What a very honest umbrella warranty says.",
  "The worst thing a valet could say when returning your car.",
  "What a sad cactus would put in a personal ad.",
  "The most suspicious item in a pirate's medicine cabinet.",
  "What a napping cat is actually dreaming about.",
  "The worst possible 'fun fact' at a dinner party.",
  "What a parking garage thinks about itself.",
  "The most awkward thing about a silent retreat.",
  "What a very hungry vending machine thinks when it's out of snacks.",
  "The most passive-aggressive way to fold someone's laundry.",
  "What a bored lifeguard at an empty pool thinks about.",
  "The worst possible trivia question to end a game night on.",
  "What a garden gnome does when nobody's in the yard.",
  "The most confusing warning label on a product that shouldn't need one.",
  "What a disappointed balloon animal thinks about its shape.",
  "The worst possible way to end a first date.",
  "What a very tired cloud thinks about having to rain again.",
  "The most honest 'open 24 hours' business description.",
  "What a trampoline thinks about adults who use it.",
  "The worst thing printed on the back of a cereal box.",
  "What a speed bump thinks about its contribution to society.",
  "The most passive-aggressive thing a roomba could do.",

  // ── More work & office ─────────────────────────────────────────
  "The least effective meeting ever held.",
  "What a very honest 'company culture' description says.",
  "The most passive-aggressive way to decline a meeting invite.",
  "What a burned-out employee's screen saver says.",
  "The worst possible team name for a work hackathon.",
  "The least inspiring 'vision statement' a company could have.",
  "What a very honest exit interview sounds like.",
  "The worst 'mandatory fun' event ever organized.",
  "What a passive-aggressive employee puts in the suggestion box.",
  "The most suspicious reason someone uses a conference room for an hour.",
  "What a very honest onboarding packet would include.",
  "The worst possible 'pro tip' in a company newsletter.",
  "What a bored IT person thinks while resetting your password.",
  "The most passive-aggressive way to mark something 'urgent' in an email.",
  "The least convincing reason someone gives for being 'camera shy' on Zoom.",
  "What a very honest job description would say under 'other duties as assigned.'",
  "The worst possible office birthday cake message.",
  "What a water cooler gossip session was actually about.",
  "The most suspicious thing someone brings to a potluck at work.",
  "The least motivational thing a manager could say before a big project.",

  // ── More modern life ──────────────────────────────────────────
  "The most suspicious thing about a free app.",
  "What your smart TV is collecting about you besides your data.",
  "The worst possible new Twitter/X policy.",
  "What your phone does for the 10 minutes after you put it down.",
  "The least useful notification anyone has ever received.",
  "What a very honest 'terms and conditions' would say in plain English.",
  "The worst possible dating app feature.",
  "What your email's 'promotions' folder thinks about you.",
  "The most passive-aggressive auto-reply message.",
  "What your laptop thinks about the amount of tabs you have open.",
  "The least convincing 'personalized recommendation' any algorithm has made.",
  "What a very honest social media algorithm would explain.",
  "The worst possible 'smart home' voice command response.",
  "What your phone thinks when you use it as a mirror.",
  "The most suspicious WiFi network name at a coffee shop.",
  "The worst thing a chatbot has ever said to someone.",
  "What a very honest cookie consent popup would say.",
  "The most passive-aggressive read receipt situation.",
  "What a forgotten smart device in the attic is still monitoring.",
  "The worst possible feature to add to email.",

  // ── More holidays ─────────────────────────────────────────────
  "The worst thing to say when you open a gift you hate.",
  "What a very honest Santa letter says to a bad kid.",
  "The most passive-aggressive Christmas card.",
  "The worst idea for a New Year's Eve countdown activity.",
  "What a very honest birthday wish would say.",
  "The most suspicious Easter egg location.",
  "The worst possible fireworks show description.",
  "What a very honest Thanksgiving prayer sounds like.",
  "The least convincing reason not to decorate for Halloween.",
  "What Valentine's Day looks like for someone who forgot until the last minute.",
  "The worst possible holiday office party game.",
  "What a very honest 'elf on the shelf' report says to Santa.",
  "The most passive-aggressive holiday card from a family that didn't have a good year.",
  "The worst New Year's countdown partner.",
  "What a very honest Christmas tree thinks while it's being decorated.",

  // ── Final batch to reach 1000 ─────────────────────────────────
  "The worst tagline for a true crime podcast.",
  "What a haunted house's Yelp response to a bad review says.",
  "The most passive-aggressive fortune cookie ever written.",
  "What the world's worst life coach charges extra for.",
  "The least helpful thing someone says when you're clearly lost.",
  "What a bored museum guard thinks about all day.",
  "The worst possible item on a kids' activity menu at a restaurant.",
  "What a very honest self-help book title says.",
  "The most suspicious 'fun fact' on a company 'about us' page.",
  "What a checkout line at Walmart thinks about humanity.",
  "The worst possible inspirational quote for a Monday morning.",
  "What a very honest Magic Kingdom ride disclaimer says.",
  "The least romantic item in a gift basket.",
  "What a storm drain thinks about rainy days.",
  "The most suspicious thing on a menu labeled 'market price.'",
  "A terrible 'life lesson' from a motivational speaker who's never struggled.",
  "The worst way to win an argument with someone who's already wrong.",
  "What an honest horoscope for Scorpio says.",
  "The least convincing excuse for not texting back for three days.",
  "What a very honest 'new and improved' product label says.",
  "The worst thing a best man could reveal during a toast.",
  "What a fridge thinks when you open it and stare for five minutes.",
  "The most useless thing you can learn on YouTube.",
  "The worst advice a stranger has ever given.",
  "What a parking ticket thinks about the car it's on.",
  "The most suspicious search result after Googling your own name.",
  "What a dentist thinks during the entire visit but never says.",
  "The worst 'networking' advice at a professional conference.",
  "What an unmotivated motivational poster says.",
  "The most honest review of a multi-level marketing product.",
  "What a very honest 'satisfaction guaranteed' policy says.",
  "The least convincing '100% natural' claim on a label.",
  "What your credit card statement says about your personality.",
  "The worst thing to hear at the DMV.",
  "What a ghost thinks about being described as a 'cold spot.'",
  "The most suspicious thing in a potluck dish nobody eats.",
  "What a bored judge thinks during a low-stakes court case.",
  "The worst thing to say to someone who just showed you their new tattoo.",
  "What a library's overdue notice would say if it could be honest.",
  "The least convincing apology anyone has ever given.",
  "What your savings account thinks about your spending habits.",
  "The worst piece of advice from a wellness influencer.",
  "What a filing cabinet thinks about its existence.",
  "The most passive-aggressive thing to put on a work mug.",
  "What a very honest 'limited time offer' banner says.",
  "The worst thing someone could write in a group chat after going quiet for a year.",
  "What a cold cup of coffee left on someone's desk thinks.",
  "The most useless rule at any homeowner's association.",
  "What a bathroom scale writes in its diary after New Year's.",
  "The worst thing a clown could say to a child.",
  "What the world's most average person worries about.",
  "The least convincing 'organic' product claim.",
  "What a shopping cart thinks about people who return it properly versus those who don't.",
  "The worst thing to discover at the end of a long hike.",
  "What an honest 'estimated delivery date' would say.",
  "The most suspicious thing on a 'handmade' Etsy listing.",
  "What a parking spot thinks when someone takes too long to pull in.",
  "The worst possible name for a neighborhood watch group.",
  "What a bird thinks about the statue it landed on.",
  "The least convincing 'no returns' policy explanation.",
  "What a hotel pillow thinks about the people who use it.",
  "The worst reason to be the last one at the office on a Friday.",
  "What a very honest LinkedIn 'congratulations on your work anniversary' message says.",
  "The most suspicious thing about a free continental breakfast.",
  "What a waiting room magazine thinks about the year it was published.",
  "The worst possible thing to put on a business card as a 'fun fact about me.'",
  "What a shopping mall thinks about itself in 2025.",
  "The most honest thought anyone has had while assembling IKEA furniture.",
  "What a recycling bin thinks about what people throw in it.",
  "The worst possible thing to bring on a camping trip.",
  "What a lonely traffic cone thinks about on a Sunday afternoon.",
  "The most passive-aggressive thing written on a shared office whiteboard.",
  "What a sandwich thinks about being eaten.",
  "The worst thing to see on your birthday cake at work.",
  "What a spin class instructor is actually thinking for the last 10 minutes.",
  "The most suspicious reason for a price increase.",
  "What a smoke detector thinks about its test.",
  "The worst thing to say before hanging up on a customer service call.",
  "What a very honest 'we value your feedback' survey says.",
  "The most unconvincing reassurance before a medical procedure.",
  "What a hotel do-not-disturb sign wishes it could say.",
  "The worst 'challenge' to go viral on the internet.",
  "What a broken vending machine is thinking.",
  "The most passive-aggressive way to say you're fine when you're not.",
  "What a pigeon thinks about the statue it calls home.",
  "The worst warning label on a product that's completely safe.",
  "What a very honest travel pillow ad would say.",
  "The most suspicious 'all natural ingredients' list.",
  "What a bored security guard at a very quiet museum thinks.",
  "The worst possible toast at a retirement party.",
  "What an honest 'we'll be with you shortly' hold message says.",
  "The most confusing thing printed on a mattress tag.",
  "What a Monday morning alarm clock thinks about its relationship with you.",
  "The worst thing to say when someone asks if you've read their email.",
  "What a very honest 'under new management' sign should really say.",
  "The most suspicious thing about a restaurant that's 'always empty but somehow stays open.'",
  "What a street lamp thinks about the neighborhood it watches over.",
];

// Deduplicate in case of accidental repeats
const _seen = new Set();
const _deduped = RANDOM_PROMPTS.filter(p => {
  const k = p.toLowerCase();
  if (_seen.has(k)) return false;
  _seen.add(k);
  return true;
});

export function getRandomPrompt() {
  return _deduped[Math.floor(Math.random() * _deduped.length)];
}

// ─── Game CRUD ────────────────────────────────────────────────────

function buildRoundConfig(numRounds, questionsPerRound) {
  return Array.from({ length: numRounds }, () => ({
    questionsPerRound,
    halftimeAfter: false,
    finalAfter: false,
  }));
}

export async function createGame(eventName) {
  await ensureAuth();
  const defaultNumRounds = 4;
  const defaultQPR = 10;
  const ref = await addDoc(collection(_db, 'last-laugh'), {
    eventName,
    phase: 'lobby',
    prompt: '',
    roundNumber: 1,       // current round (1-based)
    questionNumber: 1,    // current question within round (1-based)
    totalRounds: defaultNumRounds,
    defaultQuestionsPerRound: defaultQPR,
    roundConfig: buildRoundConfig(defaultNumRounds, defaultQPR),
    timerSeconds: 60,
    timerEnd: null,
    submissionsOpen: false,
    votingOpen: false,
    results: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateGameConfig(gameId, { numRounds, defaultQuestionsPerRound, roundConfig }) {
  await ensureAuth();
  await updateDoc(doc(_db, 'last-laugh', gameId), {
    totalRounds: numRounds,
    defaultQuestionsPerRound,
    roundConfig,
    // Reset position to start when config changes
    roundNumber: 1,
    questionNumber: 1,
    updatedAt: serverTimestamp()
  });
}

export async function loadGame(gameId) {
  const snap = await getDoc(doc(_db, 'last-laugh', gameId));
  if (!snap.exists()) throw new Error('Game not found: ' + gameId);
  return { id: snap.id, ...snap.data() };
}

export function watchGame(gameId, cb) {
  return onSnapshot(doc(_db, 'last-laugh', gameId), snap => {
    if (snap.exists()) cb({ id: snap.id, ...snap.data() });
  });
}

export function watchSubmissions(gameId, cb) {
  const q = query(
    collection(_db, 'last-laugh', gameId, 'submissions'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function watchTeams(gameId, cb) {
  return onSnapshot(
    collection(_db, 'last-laugh', gameId, 'teams'),
    snap => { cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }
  );
}

// ─── Phase Transitions ────────────────────────────────────────────

export async function startRound(gameId, prompt, timerSeconds) {
  await ensureAuth();
  const timerEnd = new Date(Date.now() + timerSeconds * 1000);
  await updateDoc(doc(_db, 'last-laugh', gameId), {
    phase: 'submission',
    prompt,
    timerSeconds,
    timerEnd,
    submissionsOpen: true,
    votingOpen: false,
    results: null,
    updatedAt: serverTimestamp()
  });
}

export async function endSubmissions(gameId) {
  await ensureAuth();
  await updateDoc(doc(_db, 'last-laugh', gameId), {
    phase: 'review',
    submissionsOpen: false,
    timerEnd: null,
    updatedAt: serverTimestamp()
  });
}

export async function openPreVote(gameId) {
  await ensureAuth();
  await updateDoc(doc(_db, 'last-laugh', gameId), {
    phase: 'pre-vote',
    updatedAt: serverTimestamp()
  });
}

export async function openVoting(gameId, timerSeconds = 20) {
  await ensureAuth();
  const timerEnd = new Date(Date.now() + timerSeconds * 1000);
  await updateDoc(doc(_db, 'last-laugh', gameId), {
    phase: 'voting',
    timerSeconds,
    timerEnd,
    votingOpen: true,
    updatedAt: serverTimestamp()
  });
}

export async function endVoting(gameId) {
  await ensureAuth();
  await updateDoc(doc(_db, 'last-laugh', gameId), {
    phase: 'results',
    votingOpen: false,
    timerEnd: null,
    updatedAt: serverTimestamp()
  });
}

export async function showLeaderboard(gameId) {
  await ensureAuth();
  await updateDoc(doc(_db, 'last-laugh', gameId), {
    phase: 'leaderboard',
    updatedAt: serverTimestamp()
  });
}

export async function endEvent(gameId) {
  await ensureAuth();
  await updateDoc(doc(_db, 'last-laugh', gameId), {
    phase: 'ended',
    updatedAt: serverTimestamp()
  });
}

export async function nextRound(gameId) {
  await ensureAuth();
  const snap = await getDoc(doc(_db, 'last-laugh', gameId));
  if (!snap.exists()) return;
  const data = snap.data();
  const roundNumber = data.roundNumber ?? 1;
  const questionNumber = data.questionNumber ?? 1;
  const totalRounds = data.totalRounds ?? 4;
  const roundConfig = data.roundConfig ?? [];
  const defaultQPR = data.defaultQuestionsPerRound ?? 10;

  const currentCfg = roundConfig[roundNumber - 1] || {};
  const questionsInRound = currentCfg.questionsPerRound ?? defaultQPR;

  let newRound = roundNumber;
  let newQuestion = questionNumber;

  if (questionNumber < questionsInRound) {
    // Advance within the same round
    newQuestion = questionNumber + 1;
  } else {
    // End of round — advance to next round, reset question
    newRound = Math.min(roundNumber + 1, totalRounds);
    newQuestion = 1;
  }

  await updateDoc(doc(_db, 'last-laugh', gameId), {
    roundNumber: newRound,
    questionNumber: newQuestion,
    phase: 'lobby',
    results: null,
    submissionsOpen: false,
    votingOpen: false,
    timerEnd: null,
    updatedAt: serverTimestamp()
  });
}

// ─── Timer ────────────────────────────────────────────────────────

export async function extendTimer(gameId, addSeconds) {
  await ensureAuth();
  const snap = await getDoc(doc(_db, 'last-laugh', gameId));
  if (!snap.exists()) return;
  const { timerEnd } = snap.data();
  const currentEnd = timerEnd?.toDate ? timerEnd.toDate() : new Date(timerEnd);
  const base = Math.max(currentEnd.getTime(), Date.now());
  await updateDoc(doc(_db, 'last-laugh', gameId), {
    timerEnd: new Date(base + addSeconds * 1000),
    updatedAt: serverTimestamp()
  });
}

// ─── Submissions ──────────────────────────────────────────────────

export async function flagSubmission(gameId, submissionId, flagged) {
  await ensureAuth();
  await updateDoc(
    doc(_db, 'last-laugh', gameId, 'submissions', submissionId),
    { flagged }
  );
}

export async function removeSubmission(gameId, submissionId) {
  await ensureAuth();
  await deleteDoc(doc(_db, 'last-laugh', gameId, 'submissions', submissionId));
}

// ─── Results & Scoring ────────────────────────────────────────────

export async function tallyAndSaveResults(gameId) {
  await ensureAuth();

  // Read all submissions
  const subsSnap = await getDocs(collection(_db, 'last-laugh', gameId, 'submissions'));
  const subs = {};
  subsSnap.docs.forEach(d => {
    const data = d.data();
    if (!data.flagged) {
      subs[d.id] = { id: d.id, ...data, points: 0 };
    }
  });

  // Read all votes and tally
  const votesSnap = await getDocs(collection(_db, 'last-laugh', gameId, 'votes'));
  const penaltyUids = new Set();

  votesSnap.docs.forEach(vd => {
    const { ranked } = vd.data();
    if (!ranked || ranked.length < 3) {
      penaltyUids.add(vd.id);
      return;
    }
    // 1st = 3pts, 2nd = 2pts, 3rd = 1pt
    [3, 2, 1].forEach((pts, i) => {
      if (subs[ranked[i]]) subs[ranked[i]].points += pts;
    });
  });

  const results = Object.values(subs)
    .sort((a, b) => b.points - a.points)
    .map(s => ({ id: s.id, text: s.text, teamName: s.teamName, points: s.points }));

  // Update team scores: add each team's submission points
  const teamsSnap = await getDocs(collection(_db, 'last-laugh', gameId, 'teams'));
  const teamScoreUpdates = [];

  teamsSnap.docs.forEach(td => {
    const team = td.data();
    let delta = 0;

    // Find this team's submission in results
    const myResult = results.find(r => r.teamName === team.name);
    if (myResult) delta += myResult.points;

    // Apply -5 penalty if this team's uid didn't fully vote
    if (penaltyUids.has(td.id)) delta -= 5;

    if (delta !== 0) {
      teamScoreUpdates.push(
        updateDoc(td.ref, { score: (team.score || 0) + delta })
      );
    }
  });

  await Promise.all([
    updateDoc(doc(_db, 'last-laugh', gameId), {
      results,
      phase: 'results',
      votingOpen: false,
      timerEnd: null,
      updatedAt: serverTimestamp()
    }),
    ...teamScoreUpdates
  ]);

  return results;
}

// ─── Prompt ───────────────────────────────────────────────────────

export async function updatePrompt(gameId, prompt) {
  await ensureAuth();
  await updateDoc(doc(_db, 'last-laugh', gameId), {
    prompt,
    updatedAt: serverTimestamp()
  });
}

// ─── Display link helper ──────────────────────────────────────────

export function buildDisplayLink(gameId) {
  return `${window.location.origin}/beachTriviaPages/games/last-laugh/display.html?gameId=${encodeURIComponent(gameId)}`;
}
