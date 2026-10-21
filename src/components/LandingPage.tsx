import Link from "next/link";
import styles from "./LandingPage.module.css";

const startTrip = "/login?next=%2Ftrips%2Fnew";

function Mark({ small = false }: { small?: boolean }) {
  return <span className={`${styles.brand} ${small ? styles.smallBrand : ""}`}><img src="/icon.svg" width={36} height={36} alt="" /><span>OffLog</span></span>;
}

function Icon({ kind }: { kind: "plane" | "home" | "document" | "spark" | "wallet" | "calendar" | "arrow" }) {
  const paths = {
    plane: <><path d="m3 14 7-3 7-7 4-1-1 4-7 7-3 7-2-6Z" /><path d="m10 11-4-5 2-1 6 3m-1 6 6 2-1 2-5-1" /></>,
    home: <><path d="m3 10 9-7 9 7M5 9v12h14V9" /><path d="M9 21v-8h6v8" /></>,
    document: <><path d="M14 3H5v18h14V8Z" /><path d="M14 3v6h5M8 13h8m-8 4h5" /></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /><path d="M20 2v4m-2-2h4" /></>,
    wallet: <><path d="M20 7H5a2 2 0 0 1 0-4h13v4M4 5v15h16V7" /><path d="M20 11h-6v5h6m-3-2.5h.01" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h3m3 0h2" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

function TripPreview() {
  return <figure className={styles.preview} aria-label="An example OffLog trip itinerary for Lisbon">
    <div className={styles.previewTop}><span className={styles.previewDots} aria-hidden="true"><i /><i /><i /></span><span>YOUR TRIP, TAKING SHAPE</span><span className={styles.previewSample}>Example itinerary</span></div>
    <div className={styles.previewBody}>
      <div className={styles.previewHeading}><span className={styles.eyebrow}>NEXT ADVENTURE</span><span className={styles.confirmed}><span aria-hidden="true">●</span> All set</span></div>
      <h2>A long weekend<br />in Lisbon.</h2>
      <p className={styles.previewDestination}>Portugal <span>·</span> 12–16 June</p>
      <div className={styles.previewRoute}><div><strong>LHR</strong><span>London</span></div><span className={styles.flightPath}><i /><Icon kind="plane" /><i /></span><div><strong>LIS</strong><span>Lisbon</span></div></div>
      <div className={styles.previewItinerary}>
        <div className={styles.previewDay}><span>FRI, 12 JUN</span><span>THE JOURNEY BEGINS</span></div>
        <div className={styles.previewEvent}><span className={styles.eventIcon}><Icon kind="plane" /></span><div><strong>You’ve arrived in Lisbon</strong><span>13:10 · Lisbon Airport</span></div><span className={styles.eventCheck} aria-hidden="true">✓</span></div>
        <div className={styles.previewEvent}><span className={styles.eventIcon}><Icon kind="home" /></span><div><strong>Check in, settle in</strong><span>15:00 · Casa do Bairro</span></div><span className={styles.eventCheck} aria-hidden="true">✓</span></div>
        <div className={styles.previewDay}><span>SAT, 13 JUN</span><span>A DAY TO EXPLORE</span></div>
        <div className={styles.previewEvent}><span className={styles.eventIcon}><Icon kind="spark" /></span><div><strong>A walk through Alfama</strong><span>10:00 · Walking tour</span></div><span className={styles.eventCheck} aria-hidden="true">✓</span></div>
      </div>
      <div className={styles.previewBottom}><span><Icon kind="document" /> Tickets & confirmations</span><span>All together <span aria-hidden="true">↗</span></span></div>
    </div>
    <figcaption className={styles.previewCaption}>A little planning. A lot to look forward to.</figcaption>
  </figure>;
}

export function LandingPage() {
  return <div className={styles.page}>
    <a href="#homepage-content" className={styles.skipLink}>Skip to content</a>
    <header className={styles.header}>
      <Link href="/" aria-label="OffLog home"><Mark /></Link>
      <nav className={styles.navigation} aria-label="Main navigation"><a href="#features">The essentials</a><a href="#on-the-go">On the go</a><a href="#travel-history">Your travel story</a></nav>
      <Link href="/login" className={styles.signIn}>Sign in <span aria-hidden="true">↗</span></Link>
    </header>

    <main id="homepage-content" className={styles.main}>
      <section className={styles.hero} aria-labelledby="homepage-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span className={styles.statusDot} /> THE PRIVATE TRAVEL PLANNER</p>
          <h1 id="homepage-title">Your trip,<br /><em>in one place.</em></h1>
          <p className={styles.heroDescription}>Keep your bookings, travel documents, itinerary, and budget together—from your first reservation to your flight home.</p>
          <div className={styles.heroActions}><Link href={startTrip} className={styles.primaryButton}>Start planning a trip <Icon kind="arrow" /></Link><a href="#features" className={styles.textLink}>Take a look around <span aria-hidden="true">↓</span></a></div>
          <p className={styles.heroNote}>Your next adventure deserves a little less searching.</p>
        </div>
        <div className={styles.heroVisual}><div className={styles.orbit} aria-hidden="true" /><TripPreview /><div className={styles.savedNote}><span className={styles.savedIcon}><Icon kind="document" /></span><span><strong>That confirmation? Found it.</strong><small>Right where your plans are.</small></span></div></div>
      </section>

      <div className={styles.travelStrip} aria-label="Organize your whole trip"><span>FROM THE FIRST BOOKING TO THE LAST GOODBYE</span><div><span><Icon kind="plane" /> Flights</span><i aria-hidden="true" /><span><Icon kind="home" /> Stays</span><i aria-hidden="true" /><span>⇄ Transfers</span><i aria-hidden="true" /><span><Icon kind="spark" /> Activities</span></div></div>

      <section id="features" className={styles.features} aria-labelledby="features-title">
        <div className={styles.sectionIntro}><div><p className={styles.eyebrow}>A PLACE FOR EVERY PLAN</p><h2 id="features-title">Everything booked.<br /><span>Everything easy to find.</span></h2></div><p>Flights in one email. Accommodation in another. Tickets somewhere in Downloads.<br /><br />OffLog brings those details into a clear itinerary, so you can find what you need when you need it.</p></div>
        <div className={styles.featuresLayout}>
          <article className={styles.featureLead}>
            <span className={styles.featureIcon}><Icon kind="calendar" /></span>
            <h3>Build your itinerary</h3>
            <p>Organize flights, stays, transfers, and activities by date. Keep track of connections, overnight arrivals, and check-in and checkout times.</p>
            <div className={styles.planIllustration} aria-hidden="true"><div><span>12 JUN</span><span className={styles.planLine} /><Icon kind="plane" /></div><div><span>13 JUN</span><span className={styles.planLine} /><Icon kind="spark" /></div><div><span>16 JUN</span><span className={styles.planLine} /><Icon kind="home" /></div></div>
            <span className={styles.featureFootnote}>The whole journey, in order.</span>
          </article>
          <div className={styles.featureList}>
            <article><span className={styles.featureIcon}><Icon kind="spark" /></span><div><h3>Bring your confirmations along</h3><p>Paste reservation text or upload a text-based PDF to help fill your booking details. Review the result, make any changes, and save.</p></div></article>
            <article><span className={styles.featureIcon}><Icon kind="document" /></span><div><h3>Keep your documents close</h3><p>Store e-tickets, reservation PDFs, insurance, and other travel documents alongside your plans.</p></div></article>
            <article><span className={styles.featureIcon}><Icon kind="wallet" /></span><div><h3>Keep an eye on your budget</h3><p>Add booking costs and see how they compare with your trip budget.</p></div></article>
          </div>
        </div>
      </section>

      <section id="on-the-go" className={styles.onTheGo} aria-labelledby="on-the-go-title">
        <div className={styles.onTheGoCopy}><p className={styles.eyebrow}>PACK YOUR PLANS, TOO</p><h2 id="on-the-go-title">Ready for<br /><em>the journey.</em></h2><p>Check your itinerary on your phone, add travel dates to Google Calendar, or save a PDF to take with you.</p><p>Your plans stay easy to reach as you move from one place to the next.</p><div className={styles.travelTools}><span><Icon kind="calendar" /> Google Calendar</span><span><Icon kind="document" /> PDF itinerary</span></div></div>
        <div className={styles.phoneScene}><div className={styles.phone}><div className={styles.phoneCamera} aria-hidden="true" /><div className={styles.phoneTop}><Mark small /><span aria-hidden="true">☰</span></div><p className={styles.eyebrow}>TODAY IN LISBON</p><h3>Hello,<br />new favorite city.</h3><div className={styles.phoneWeather} aria-hidden="true"><span>✳</span><div className={styles.phoneHill} /><div className={styles.phoneTower} /></div><div className={styles.phonePlan}><span className={styles.eventIcon}><Icon kind="spark" /></span><div><strong>Alfama walking tour</strong><span>10:00 · Saturday, 13 June</span></div></div><div className={styles.phoneDocument}><Icon kind="document" /><span>Your itinerary.<br /><strong>Right here.</strong></span><span aria-hidden="true">↗</span></div></div><span className={styles.phoneCaption}>Example trip preview</span></div>
      </section>

      <section id="travel-history" className={styles.history} aria-labelledby="travel-history-title">
        <div className={styles.historyVisual} aria-hidden="true"><div className={styles.mapGrid} /><svg viewBox="0 0 540 300" fill="none"><path d="M70 196C134 74 178 90 248 128S400 202 465 61" stroke="#315460" strokeWidth="1.5" strokeDasharray="5 7" /><circle cx="70" cy="196" r="5" fill="#22d3ee" /><circle cx="248" cy="128" r="5" fill="#22d3ee" /><circle cx="465" cy="61" r="5" fill="#22d3ee" /><circle cx="248" cy="128" r="16" stroke="#22d3ee" strokeOpacity=".25" /><circle cx="248" cy="128" r="28" stroke="#22d3ee" strokeOpacity=".1" /></svg><span className={styles.mapLisbon}>LISBON<small>A weekend well spent.</small></span><span className={styles.mapRome}>ROME<small>One more espresso.</small></span><span className={styles.mapTokyo}>TOKYO<small>So much to come back for.</small></span></div>
        <div className={styles.historyCopy}><p className={styles.eyebrow}>THE PLACES STAY WITH YOU</p><h2 id="travel-history-title">Remember<br />where you’ve been.</h2><p>Keep a history of the places you’ve visited and see them on a map. Add visits yourself or bring in travel history from Google Timeline and Google Photos.</p></div>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title"><p className={styles.eyebrow}>THE NEXT CHAPTER IS YOURS</p><h2 id="closing-title">Where are you<br /><em>heading next?</em></h2><p>Give your next trip a home.</p><Link href={startTrip} className={styles.primaryButton}>Create your first trip <Icon kind="arrow" /></Link></section>
    </main>
    <footer className={styles.footer}><Link href="/" aria-label="OffLog home"><Mark small /></Link><p>A private space for your travel plans.</p><Link href="/login">Sign in <span aria-hidden="true">↗</span></Link></footer>
  </div>;
}
