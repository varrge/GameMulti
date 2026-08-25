import java.security.MessageDigest

plugins {
    java
    id("com.gradleup.shadow") version "8.3.6"
}

group = "cn.gamemp"
version = "0.1.0"
val pluginVersion = version.toString()

java {
    toolchain.languageVersion = JavaLanguageVersion.of(21)
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencyLocking {
    lockAllConfigurations()
    ignoredDependencies.add("io.papermc.paper:paper-api")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-20250925.065901-231")

    implementation("com.fasterxml.jackson.core:jackson-databind:2.22.2")
    implementation("com.fasterxml.jackson.dataformat:jackson-dataformat-yaml:2.22.2")

    testImplementation(platform("org.junit:junit-bom:5.11.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release = 21
}

tasks.withType<AbstractArchiveTask>().configureEach {
    isPreserveFileTimestamps = false
    isReproducibleFileOrder = true
}

tasks.processResources {
    filesMatching("plugin.yml") {
        expand("version" to pluginVersion)
    }
}

tasks.test {
    useJUnitPlatform()
}

tasks.jar {
    enabled = false
}

tasks.shadowJar {
    archiveBaseName = "gamemulti-paper"
    archiveClassifier = ""
    archiveVersion = pluginVersion
    relocate("com.fasterxml.jackson", "cn.gamemp.gamemulti.lib.jackson")
    relocate("org.yaml.snakeyaml", "cn.gamemp.gamemulti.lib.snakeyaml")
}

tasks.register("releaseChecksum") {
    dependsOn(tasks.shadowJar)
    doLast {
        val jar = tasks.shadowJar.get().archiveFile.get().asFile
        val digest = MessageDigest.getInstance("SHA-256")
        jar.inputStream().use { input ->
            val buffer = ByteArray(8192)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        val checksum = digest.digest().joinToString("") { "%02x".format(it) }
        jar.resolveSibling(jar.name + ".sha256").writeText("$checksum  ${jar.name}\n")
    }
}

tasks.build {
    dependsOn(tasks.shadowJar)
}
