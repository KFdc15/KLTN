<script setup lang="ts">
import LandingNavbar from './components/LandingNavbar.vue'
import HeroSection from './components/HeroSection.vue'
import FeaturesSection from './components/FeaturesSection.vue'
import ArchitectureSection from './components/ArchitectureSection.vue'
import CtaSection from './components/CtaSection.vue'
import LandingFooter from './components/LandingFooter.vue'
</script>

<template>
	<div class="min-h-screen text-slate-900">
		<div class="fixed inset-0 -z-10 bg-linear-to-br from-sky-200/40 via-white to-indigo-200/30" />
		<div class="fixed inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(56,189,248,0.18),transparent_60%)]" />

		<LandingNavbar />

		<main class="mx-auto max-w-6xl px-4 pt-24 pb-16 sm:px-6">
			<div class="space-y-20">
				<HeroSection />
				<FeaturesSection />
				<ArchitectureSection />
				<CtaSection />
			</div>
		</main>

		<LandingFooter />
	</div>
</template>
