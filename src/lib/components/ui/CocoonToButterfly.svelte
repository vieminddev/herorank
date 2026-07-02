<script lang="ts">
  import { onMount } from 'svelte';
  import { Sparkles, TrendingUp } from 'lucide-svelte';

  // Animation timeline phases:
  // 0: Cocoon (0s - 2s) - Cocoon pulses gently, rank is #84.
  // 1: Hatching (2s - 3s) - Cocoon shakes and splits open.
  // 2: Emerging (3s - 5s) - Butterfly emerges, scales up, trend line rises, rank ticks down to #2.
  // 3: Bloomed (5s - 7.5s) - Butterfly flaps gently, rank is #2 with success glow.
  // 4: Resetting (7.5s - 8s) - Fade out to loop back.
  let phase = $state(0);
  let rank = $state(84);
  let rootEl: HTMLElement;

  // Hardcoded paths from the vectorized logo
  const path0 = "M176 160 L193 160 L195 162 L196 161 L214 163 L256 173 L260 176 L278 182 L308 197 L316 203 L322 205 L358 230 L385 253 L411 279 L426 296 L429 302 L435 307 L440 316 L460 342 L468 358 L478 373 L481 381 L484 383 L484 386 L494 405 L486 428 L479 440 L478 446 L470 462 L471 464 L468 467 L468 471 L466 473 L460 493 L457 497 L455 497 L428 435 L425 432 L415 410 L393 374 L379 354 L375 351 L375 349 L371 346 L371 344 L358 329 L332 303 L312 286 L310 286 L303 279 L298 277 L277 262 L267 258 L248 247 L245 247 L225 238 L207 234 L196 232 L176 232 L167 234 L157 239 L148 248 L145 254 L141 275 L143 277 L143 286 L147 298 L147 303 L173 368 L178 391 L180 392 L179 396 L182 401 L184 415 L190 437 L193 440 L196 451 L201 461 L212 477 L229 494 L250 506 L268 512 L288 514 L289 516 L295 517 L324 517 L331 515 L332 516 L334 514 L344 514 L363 511 L382 512 L397 522 L401 526 L405 535 L405 540 L407 542 L407 552 L405 554 L405 559 L401 567 L394 575 L383 581 L375 583 L364 583 L363 585 L351 586 L336 590 L326 594 L305 608 L303 608 L300 612 L289 620 L288 623 L279 631 L267 649 L260 664 L258 673 L255 677 L256 682 L254 684 L252 697 L253 724 L256 729 L258 740 L266 757 L271 761 L274 767 L282 775 L288 778 L291 782 L305 788 L310 788 L314 790 L328 790 L333 788 L339 788 L350 782 L353 782 L355 779 L368 771 L375 764 L375 762 L382 756 L386 748 L391 744 L399 729 L404 723 L412 705 L415 702 L419 694 L419 691 L428 675 L437 650 L439 649 L438 647 L441 644 L449 618 L452 614 L451 613 L453 611 L452 610 L454 608 L462 580 L465 576 L464 574 L467 570 L473 547 L480 530 L484 513 L488 502 L491 498 L501 466 L504 463 L510 445 L515 437 L514 436 L519 428 L521 420 L526 409 L528 408 L527 407 L531 402 L539 383 L543 379 L545 373 L558 353 L562 344 L588 307 L593 303 L595 298 L643 248 L655 238 L657 238 L661 233 L672 226 L675 222 L677 222 L696 208 L724 192 L773 171 L809 163 L827 161 L828 162 L830 160 L846 160 L848 162 L865 163 L881 167 L896 173 L897 175 L901 176 L911 183 L927 198 L940 216 L946 231 L949 245 L951 247 L950 254 L952 255 L953 263 L953 281 L951 298 L949 300 L948 311 L946 314 L946 319 L942 328 L940 338 L937 342 L938 343 L935 347 L931 361 L929 363 L927 371 L924 374 L925 375 L923 377 L918 392 L918 396 L914 407 L914 413 L911 417 L905 448 L901 460 L898 464 L891 485 L887 490 L888 491 L886 492 L881 503 L868 520 L868 522 L861 528 L855 536 L852 537 L834 553 L824 560 L799 573 L774 581 L769 581 L760 584 L758 583 L757 585 L732 588 L696 588 L685 586 L671 586 L664 585 L662 583 L651 583 L635 579 L624 570 L619 562 L618 556 L616 554 L616 539 L625 522 L641 512 L661 511 L690 514 L692 516 L693 515 L701 517 L728 517 L735 515 L736 516 L738 514 L755 512 L765 508 L769 508 L777 504 L796 492 L811 477 L825 455 L829 443 L832 439 L831 437 L834 433 L842 395 L845 391 L849 371 L866 326 L869 322 L868 321 L871 317 L876 301 L879 289 L880 265 L875 249 L867 240 L861 236 L846 232 L827 232 L815 234 L792 240 L788 243 L770 249 L759 256 L749 260 L720 279 L718 282 L713 284 L695 299 L664 330 L651 345 L651 347 L646 351 L627 378 L624 385 L621 387 L616 398 L607 411 L583 460 L584 461 L579 469 L579 472 L571 488 L572 489 L570 490 L568 495 L566 504 L564 506 L564 510 L555 531 L555 535 L551 544 L547 561 L542 571 L542 575 L538 584 L538 589 L533 599 L534 601 L531 605 L525 623 L525 627 L520 637 L521 639 L518 642 L516 652 L512 660 L512 664 L507 672 L508 673 L505 677 L497 700 L492 708 L492 711 L484 726 L484 729 L481 731 L479 735 L477 742 L459 773 L447 789 L447 791 L443 794 L434 807 L416 825 L397 839 L379 848 L376 851 L358 857 L334 861 L311 861 L296 859 L269 851 L266 848 L263 848 L246 838 L236 829 L230 826 L230 824 L218 813 L212 804 L208 801 L191 769 L188 757 L186 755 L187 752 L184 748 L180 724 L180 688 L182 681 L182 673 L185 661 L187 660 L186 656 L191 646 L193 637 L204 614 L219 592 L233 576 L202 562 L184 549 L182 549 L158 526 L141 502 L137 493 L135 492 L119 452 L112 419 L110 417 L111 413 L109 412 L108 404 L106 401 L106 397 L100 378 L97 374 L98 373 L91 359 L89 350 L82 336 L82 332 L78 323 L74 307 L74 301 L72 299 L73 296 L71 294 L71 250 L74 245 L74 239 L80 222 L93 201 L109 185 L131 171 L158 163 L174 162 L176 160 Z";
  const path1 = "M809 601 L814 605 L822 622 L825 625 L824 626 L831 640 L835 656 L837 657 L836 659 L838 660 L843 695 L842 732 L840 736 L838 751 L836 753 L837 754 L835 756 L833 765 L825 784 L814 800 L814 802 L789 829 L787 829 L767 844 L743 855 L713 861 L689 861 L665 857 L647 851 L644 848 L623 838 L595 814 L594 811 L587 805 L579 793 L575 790 L575 788 L557 762 L556 758 L552 754 L553 753 L551 752 L542 732 L540 731 L541 730 L538 728 L538 725 L533 716 L529 704 L534 688 L543 669 L551 643 L554 639 L560 621 L560 617 L562 615 L562 610 L565 605 L568 606 L571 612 L570 613 L575 622 L581 642 L584 644 L583 647 L586 650 L594 673 L597 676 L596 677 L603 689 L605 697 L610 703 L609 704 L612 707 L620 725 L633 743 L633 745 L635 746 L634 747 L638 750 L643 758 L651 765 L656 772 L668 779 L670 782 L684 788 L690 788 L694 790 L709 790 L713 788 L718 788 L729 783 L741 775 L748 768 L760 751 L767 730 L769 728 L771 714 L771 697 L769 684 L767 682 L768 679 L766 678 L764 668 L756 649 L747 636 L747 634 L736 621 L736 618 L752 616 L753 617 L759 614 L778 612 L799 606 L809 601 Z";

  onMount(() => {
    // Accessibility: for reduced-motion users, skip the looping animation entirely and
    // show the static "after" state (bloomed butterfly, optimized rank #2).
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      phase = 4;
      rank = 2;
      return;
    }

    let loopInterval: any;
    let rankInterval: any;
    let timeouts: any[] = [];
    let running = false;
    let isVisible = false;

    const clearPhaseTimers = () => {
      timeouts.forEach(clearTimeout);
      timeouts = [];
      clearInterval(rankInterval);
    };

    const runLoop = () => {
      clearPhaseTimers();
      // Phase 0: Cocoon pulse
      phase = 0;
      rank = 84;
      // Phase 1: Magic wand enters (1.5s)
      timeouts.push(setTimeout(() => (phase = 1), 1500));
      // Phase 2: Hatching / shaking & cracking (2.0s)
      timeouts.push(setTimeout(() => (phase = 2), 2000));
      // Phase 3: Emerging & rank ticking (3.2s)
      timeouts.push(
        setTimeout(() => {
          phase = 3;
          let currentRank = 84;
          const tickTime = 1800 / 82; // tick over 1.8 seconds
          rankInterval = setInterval(() => {
            if (currentRank > 2) {
              currentRank -= 1;
              rank = currentRank;
            } else {
              clearInterval(rankInterval);
            }
          }, tickTime);
        }, 3200)
      );
      // Phase 4: Bloomed flapping (5.5s)
      timeouts.push(setTimeout(() => (phase = 4), 5500));
      // Phase 5: Resetting (7.5s)
      timeouts.push(setTimeout(() => (phase = 5), 7500));
    };

    const start = () => {
      if (running) return;
      running = true;
      runLoop();
      loopInterval = setInterval(runLoop, 8000);
    };

    const stop = () => {
      if (!running) return;
      running = false;
      clearInterval(loopInterval);
      clearPhaseTimers();
    };

    // Pause when the tab is backgrounded (saves CPU/battery).
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (isVisible) start();
    };

    // Pause when scrolled out of the hero (only animate what the user can see).
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          isVisible = e.isIntersecting;
          if (e.isIntersecting && !document.hidden) start();
          else stop();
        }
      },
      { threshold: 0.2 }
    );
    if (rootEl) io.observe(rootEl);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });

</script>

<div bind:this={rootEl} class="meta-card rounded-2xl p-5 w-full border border-white/10 relative overflow-hidden text-white flex gap-6 items-center shadow-[0_8px_32px_rgba(0,98,65,0.25)] select-none" style="background: rgba(255,255,255,0.03); backdrop-filter: blur(12px);">
  <!-- Glowing subtle backdrop for the active state -->
  <div class="absolute inset-0 bg-gradient-to-tr from-[#0a9663]/5 via-transparent to-[#cba258]/5 transition-opacity duration-700 {phase >= 3 ? 'opacity-100' : 'opacity-0'}" aria-hidden="true"></div>
  
  <!-- Left Side: Visual Animation Window -->
  <div class="visual-box relative w-32 h-32 flex items-center justify-center shrink-0 border border-white/5 bg-white/[0.02] rounded-xl overflow-hidden">
    <!-- SVG Viewport -->
    <svg viewBox="0 0 1024 1024" class="w-24 h-24 overflow-visible transition-opacity duration-300 {phase === 5 ? 'opacity-0' : 'opacity-100'}">
      <defs>
        <linearGradient id="butterfly-glow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00ffaa" />
          <stop offset="100%" stop-color="#059669" />
        </linearGradient>
        <clipPath id="meta-left-clip">
          <rect x="0" y="0" width="512" height="1024" />
        </clipPath>
        <clipPath id="meta-right-clip">
          <rect x="512" y="0" width="512" height="1024" />
        </clipPath>
      </defs>

      <!-- Cocoon Shell (visible in phase 0, 1 and 2) -->
      {#if phase <= 2}
        <g class="cocoon-group {phase === 2 ? 'shake-cocoon' : (phase === 0 ? 'pulse-cocoon' : '')}">
          <!-- Left Shell half -->
          <path d="M 432 332 C 432 232, 512 232, 512 332 L 512 692 C 512 792, 432 792, 432 692 Z" fill="#006241" stroke="#0a9663" stroke-width="6" class="shell-l {phase === 2 ? 'crack-l' : ''}" />
          <!-- Right Shell half -->
          <path d="M 512 332 C 512 232, 592 232, 592 332 L 592 692 C 592 792, 512 792, 512 692 Z" fill="#006241" stroke="#0a9663" stroke-width="6" class="shell-r {phase === 2 ? 'crack-r' : ''}" />
          
          <!-- Inner warm glow inside cocoon -->
          <circle cx="512" cy="512" r="60" fill="#cba258" opacity="0.3" class="cocoon-glow" />
          
          <!-- Wrapped silk lines -->
          <path d="M432 400 Q512 430, 592 400" stroke="#0a9663" stroke-width="3" fill="none" opacity="0.6" />
          <path d="M432 500 Q512 530, 592 500" stroke="#0a9663" stroke-width="3" fill="none" opacity="0.6" />
          <path d="M432 600 Q512 630, 592 600" stroke="#0a9663" stroke-width="3" fill="none" opacity="0.6" />
        </g>
      {/if}

      <!-- Sparkle Burst at tap point (Phase 1) -->
      {#if phase === 1 || phase === 2}
        <g class="tap-sparkles" style="transform-origin: 520px 412px;">
          <circle cx="520" cy="412" r="30" fill="none" stroke="#fff" stroke-width="4" class="tap-ring" />
          <path d="M520 372 L520 352 M520 452 L520 472 M480 412 L460 412 M560 412 L580 412" stroke="#cba258" stroke-width="4" stroke-linecap="round" class="tap-lines" />
          <path d="M492 384 L478 370 M548 440 L562 454 M492 440 L478 454 M548 384 L562 370" stroke="#cba258" stroke-width="3" stroke-linecap="round" class="tap-lines" />
        </g>

                <!-- Magic Wand (Bigger, from bottom-right perspective) -->
        <g class="wand-group" style="transform-origin: 512px 512px;">
          <!-- Wand Stick -->
          <line x1="1200" y1="1200" x2="520" y2="412" stroke="#cba258" stroke-width="24" stroke-linecap="round" />
          <!-- Wand Handle (darker brown) -->
          <line x1="1200" y1="1200" x2="980" y2="945" stroke="#8e6220" stroke-width="32" stroke-linecap="round" />
          
          <!-- Golden metal collar -->
          <line x1="980" y1="945" x2="970" y2="933" stroke="#d4af37" stroke-width="29" />

          <!-- Sparkle/Star at tip (Bigger) -->
          <path d="M 520 376 L 529 401 L 554 412 L 529 423 L 520 448 L 511 423 L 486 412 L 511 401 Z" fill="#ffffff" filter="drop-shadow(0 0 20px #cba258)" class="wand-star" />
          <circle cx="520" cy="412" r="32" fill="#ffffff" opacity="0.5" filter="blur(10px)" class="wand-glow" />
        </g>
      {/if}

      <!-- Butterfly emerging & bloomed (emerges in phase 3, active in phase 4) -->
      {#if phase >= 3}
        <g class="butterfly-group {phase === 3 ? 'emerge-butterfly' : 'rest-butterfly'}">
          <!-- Left Wing Group -->
          <g clip-path="url(#meta-left-clip)" class="meta-wing-left {phase >= 3 ? 'wing-flap-left' : ''}">
            <path d={path0} fill="url(#butterfly-glow-grad)" />
            <path d={path1} fill="url(#butterfly-glow-grad)" />
          </g>
          
          <!-- Right Wing Group -->
          <g clip-path="url(#meta-right-clip)" class="meta-wing-right {phase >= 3 ? 'wing-flap-right' : ''}">
            <path d={path0} fill="url(#butterfly-glow-grad)" />
            <path d={path1} fill="url(#butterfly-glow-grad)" />
          </g>
        </g>
      {/if}

      <!-- Rising Rank Trendline Graph -->
      <path
        d="M 50 850 Q 300 800, 500 700 T 900 200"
        fill="none"
        stroke={phase >= 3 ? '#1e8e5a' : '#c0392b'}
        stroke-width="12"
        stroke-dasharray={phase >= 3 ? "1500" : "15 15"}
        stroke-dashoffset={phase >= 3 ? "0" : "0"}
        class="rank-path {phase === 3 ? 'draw-path' : ''}"
        opacity={phase === 0 ? "0.35" : "1"}
      />
      
      <!-- Rising dot on path -->
      {#if phase >= 3}
        <circle cx="900" cy="200" r="24" fill="#1e8e5a" class="path-tip-dot" />
        <circle cx="900" cy="200" r="48" fill="#1e8e5a" opacity="0.3" class="path-tip-ring" />
      {/if}
    </svg>

    <!-- Sparkle bursts when hatching succeeds -->
    {#if phase === 3 || phase === 4}
      <div class="sparkles-container absolute inset-0 pointer-events-none">
        <div class="sparkle s1"><Sparkles size={16} class="text-[#cba258]" /></div>
        <div class="sparkle s2"><Sparkles size={12} class="text-[#0a9663]" /></div>
        <div class="sparkle s3"><Sparkles size={14} class="text-white" /></div>
      </div>
    {/if}
  </div>

  <!-- Right Side: Content & Rank Ticker -->
  <div class="flex-1 min-w-0">
    <div class="flex items-center gap-1.5 mb-1.5">
      <span class="text-[10px] tracking-wider uppercase font-bold text-white/80">Etsy Search Rank</span>
      {#if phase >= 3}
        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#e6f4ed] text-[#1e8e5a] uppercase ml-auto shadow-[0_0_8px_rgba(30,142,90,0.2)]">Optimized</span>
      {:else}
        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#fbe9e7] text-[#c0392b] uppercase ml-auto">Unoptimized</span>
      {/if}
    </div>
    
    <!-- Big Rank Ticker -->
    <div class="flex items-baseline gap-2 mb-2 font-mono">
      <span class="text-4xl font-extrabold tracking-tight transition-colors duration-300 {phase >= 3 ? 'text-[#1e8e5a]' : 'text-[#c0392b]'}">
        #{rank}
      </span>
      <span class="text-xs text-white/70">position</span>
      
      {#if phase >= 3}
        <span class="text-xs font-bold text-[#1e8e5a] flex items-center gap-0.5 ml-auto animate-fade-in">
          <TrendingUp size={13} /> +3,800%
        </span>
      {/if}
    </div>

    <!-- Description Text -->
    <p class="text-xs leading-relaxed text-white/90 h-8 flex items-center">
      {#if phase === 0}
        Incubating in cocoon... listing is buried on page 4.
      {:else if phase === 1}
        Casting Etsy SEO optimization spell...
      {:else if phase === 2}
        Optimizing metadata & keywords... cracking shell!
      {:else if phase === 3}
        Emerging! Wings open, SEO scores rising!
      {:else if phase === 4}
        Ranked #2 on page 1! Driving organic sales.
      {:else if phase === 5}
        Refreshing cycle...
      {/if}
    </p>
  </div>

</div>


<style>
  /* Cocoon pulsing animation */
  .pulse-cocoon {
    animation: pulse-c 2s ease-in-out infinite;
    transform-origin: 512px 512px;
  }
  @keyframes pulse-c {
    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(0,98,65,0.4)); }
    50% { transform: scale(1.04); filter: drop-shadow(0 0 20px rgba(10,150,99,0.7)); }
  }

  /* Shaking cocoon before cracking */
  .shake-cocoon {
    animation: shake-c 1s ease-in-out infinite;
    transform-origin: 512px 512px;
  }
  @keyframes shake-c {
    0%, 100% { transform: rotate(0deg); }
    12.5% { transform: rotate(-3deg); }
    25% { transform: rotate(3deg); }
    37.5% { transform: rotate(-3deg); }
    50% { transform: rotate(3deg); }
    62.5% { transform: rotate(-1.5deg); }
    75% { transform: rotate(1.5deg); }
    87.5% { transform: rotate(-1.5deg); }
  }

  /* Cracking cocoon shells open */
  .shell-l, .shell-r {
    transition: transform 0.8s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.6s ease;
    transform-origin: 512px 512px;
  }
  .shell-l.crack-l {
    transform: translateX(-140px) rotate(-20deg) scale(0.8);
    opacity: 0;
  }
  .shell-r.crack-r {
    transform: translateX(140px) rotate(20deg) scale(0.8);
    opacity: 0;
  }
  
  .cocoon-glow {
    animation: glow-c 2s ease-in-out infinite;
  }
  @keyframes glow-c {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.7; }
  }

  /* Butterfly emerging state */
  .butterfly-group {
    transform-origin: 512px 512px;
    filter: drop-shadow(0 0 16px rgba(0, 255, 170, 0.65));
  }
  .emerge-butterfly {
    animation: emerge-b 2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  }
  @keyframes emerge-b {
    0% { transform: scale(0.1) translateY(300px); opacity: 0; }
    40% { transform: scale(1.1) translateY(-30px); opacity: 1; }
    100% { transform: scale(1) translateY(0); opacity: 1; }
  }

  /* Butterfly gentle flapping state */
  .rest-butterfly {
    animation: rest-b 3s ease-in-out infinite;
  }
  @keyframes rest-b {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-8px) rotate(1deg); }
  }

  /* Butterfly wings flapping */
  .meta-wing-left, .meta-wing-right {
    transform-origin: 512px 512px;
  }
  
  /* Faster emerge flapping */
  .emerge-butterfly .wing-flap-left {
    animation: flap-l-fast 0.35s ease-in-out infinite;
  }
  .emerge-butterfly .wing-flap-right {
    animation: flap-r-fast 0.35s ease-in-out infinite;
  }

  /* Slower hover/idle flapping */
  .rest-butterfly .wing-flap-left {
    animation: flap-l-slow 0.8s ease-in-out infinite;
  }
  .rest-butterfly .wing-flap-right {
    animation: flap-r-slow 0.8s ease-in-out infinite;
  }

  @keyframes flap-l-fast {
    0%, 100% { transform: scaleX(1); }
    50% { transform: scaleX(0.5); }
  }
  @keyframes flap-r-fast {
    0%, 100% { transform: scaleX(1); }
    50% { transform: scaleX(0.5); }
  }
  
  @keyframes flap-l-slow {
    0%, 100% { transform: scaleX(1) rotate(0deg); }
    50% { transform: scaleX(0.65) rotate(-3deg); }
  }
  @keyframes flap-r-slow {
    0%, 100% { transform: scaleX(1) rotate(0deg); }
    50% { transform: scaleX(0.65) rotate(3deg); }
  }


  /* Drawing the trend line dynamically */
  .rank-path {
    stroke-dasharray: 1000;
    stroke-dashoffset: 1000;
    transition: stroke-dashoffset 1.5s cubic-bezier(0.25, 0.8, 0.25, 1), stroke 0.5s ease;
  }
  .rank-path.draw-path {
    stroke-dashoffset: 0;
  }

  /* Glow dots at the path tip */
  .path-tip-dot {
    animation: dot-glow 0.8s ease-in-out infinite alternate;
  }
  .path-tip-ring {
    animation: ring-expand 1.6s cubic-bezier(0.215, 0.610, 0.355, 1) infinite;
    transform-origin: 900px 200px;
  }
  @keyframes dot-glow {
    from { r: 16px; }
    to { r: 24px; filter: drop-shadow(0 0 10px #1e8e5a); }
  }
  @keyframes ring-expand {
    0% { transform: scale(0.5); opacity: 0.8; }
    100% { transform: scale(1.8); opacity: 0; }
  }

  /* Sparkles bursts details */
  .sparkle {
    position: absolute;
    opacity: 0;
    transform: scale(0.2);
  }
  .sparkles-container .s1 {
    left: 20%; top: 20%;
    animation: sparkle-pop 1.5s ease-out infinite;
  }
  .sparkles-container .s2 {
    right: 25%; top: 15%;
    animation: sparkle-pop 1.5s ease-out infinite 0.3s;
  }
  .sparkles-container .s3 {
    left: 45%; bottom: 15%;
    animation: sparkle-pop 1.5s ease-out infinite 0.6s;
  }
  
  @keyframes sparkle-pop {
    0% { transform: scale(0.2) translate(0, 0) rotate(0deg); opacity: 0; }
    50% { opacity: 1; }
    100% { transform: scale(1.1) translate(var(--dx, -15px), var(--dy, -15px)) rotate(90deg); opacity: 0; }
  }
  .s1 { --dx: -25px; --dy: -25px; }
  .s2 { --dx: 25px; --dy: -20px; }
  .s3 { --dx: -10px; --dy: 25px; }

    /* Magic Wand Animation from bottom-right perspective */
  .wand-group {
    animation: wand-tap-anim 1.2s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
  }
  @keyframes wand-tap-anim {
    0% { transform: translate(450px, 450px) rotate(-15deg); opacity: 0; }
    25% { transform: translate(60px, 60px) rotate(-5deg); opacity: 1; }
    /* Tap impact */
    40% { transform: translate(0px, 0px) rotate(0deg); opacity: 1; }
    /* Rebound back down-right */
    48% { transform: translate(30px, 30px) rotate(-2deg); opacity: 1; }
    70% { transform: translate(25px, 25px) rotate(-2deg); opacity: 1; }
    100% { transform: translate(500px, 500px) rotate(20deg); opacity: 0; }
  }

  .wand-star {
    transform-origin: 520px 412px;
    animation: wand-star-flash 1.2s ease-out forwards;
  }
  @keyframes wand-star-flash {
    0%, 35% { transform: scale(0.6); opacity: 0.8; }
    /* Flash at impact (40%) */
    40% { transform: scale(2.8); fill: #fff; filter: drop-shadow(0 0 28px #fff); }
    50% { transform: scale(1); opacity: 1; }
    100% { transform: scale(0.5); opacity: 0; }
  }

  .wand-glow {
    transform-origin: 520px 412px;
    animation: wand-glow-anim 1.2s ease-out forwards;
  }
  @keyframes wand-glow-anim {
    0%, 35% { transform: scale(0.5); opacity: 0; }
    40% { transform: scale(4.5); opacity: 0.9; }
    50% { transform: scale(2.0); opacity: 0.5; }
    100% { transform: scale(0.5); opacity: 0; }
  }

  /* Sparkles on Wand Tap */
  .tap-sparkles {
    transform-origin: 520px 412px;
  }
  .tap-ring {
    transform-origin: 520px 412px;
    animation: tap-ring-anim 1.2s ease-out forwards;
  }
  @keyframes tap-ring-anim {
    0%, 38% { transform: scale(0.1); opacity: 0; }
    40% { transform: scale(0.2); opacity: 1; stroke-width: 8; }
    70% { transform: scale(1.6); opacity: 0; stroke-width: 1; }
    100% { opacity: 0; }
  }
  .tap-lines {
    transform-origin: 520px 412px;
    animation: tap-lines-anim 1.2s ease-out forwards;
  }
  @keyframes tap-lines-anim {
    0%, 38% { transform: scale(0.3); opacity: 0; }
    40% { transform: scale(0.6); opacity: 1; }
    80% { transform: scale(1.3); opacity: 0; }
    100% { opacity: 0; }
  }

  /* Reduced motion: freeze on the static "after" frame (phase 4) — no looping/flapping. */
  @media (prefers-reduced-motion: reduce) {
    .pulse-cocoon, .shake-cocoon, .cocoon-glow,
    .emerge-butterfly, .rest-butterfly,
    .wing-flap-left, .wing-flap-right,
    .path-tip-dot, .path-tip-ring, .sparkle,
    .wand-group, .wand-star, .wand-glow, .tap-ring, .tap-lines {
      animation: none !important;
    }
    .butterfly-group { transform: none !important; }
  }
</style>
