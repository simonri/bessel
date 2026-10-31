from typing import Any

import pytest
from api.memory import service
from api.tests.fixtures.mcp import ConnectFixture, mcp_call


def fact(attribute: str, statement: str, **extra: Any) -> dict[str, Any]:
  return {"area": "kropp/kläder", "attribute": attribute, "statement": statement, "kind": "stated", **extra}


def guess(attribute: str, statement: str, based_on: list[str], **extra: Any) -> dict[str, Any]:
  return fact(attribute, statement, kind="inferred", based_on=based_on, **extra)


async def remember(connect: ConnectFixture, *facts: dict[str, Any], token: str = "token-a") -> list[dict[str, Any]]:
  return (await mcp_call(connect, "remember", {"facts": list(facts)}, token=token))["results"]


async def known(connect: ConnectFixture) -> str:
  """A fact for guesses to be based on."""
  [result] = await remember(connect, fact("läggdags", "Släcker vid 02 på vardagar", area="sömn/vanor"))
  return result["fact"]["id"]


async def revise(connect: ConnectFixture, *changes: dict[str, Any]) -> list[dict[str, Any]]:
  return (await mcp_call(connect, "revise_memory", {"changes": list(changes)}))["results"]


async def search(connect: ConnectFixture, **arguments: Any) -> list[dict[str, Any]]:
  return (await mcp_call(connect, "search_memory", arguments))["facts"]


class TestRemember:
  @pytest.mark.asyncio
  async def test_a_new_fact_is_stored_with_its_evidence(self, connect: ConnectFixture) -> None:
    [result] = await remember(connect, fact("skostorlek", "44 (EU)", evidence=[{"source": "user", "day": "2026-10-28"}]))

    assert result["outcome"] == "added"
    stored = result["fact"]
    assert (stored["area"], stored["attribute"], stored["statement"]) == ("kropp/kläder", "skostorlek", "44 (EU)")
    assert (stored["kind"], stored["status"], stored["confirm_count"]) == ("stated", "confirmed", 1)
    assert stored["evidence"] == [{"source": "user", "ref": None, "day": "2026-10-28", "note": None}]
    assert stored["valid_to"] is None
    assert stored["valid_from"] is not None

  @pytest.mark.asyncio
  async def test_the_same_fact_again_confirms_it_instead_of_adding_a_copy(self, connect: ConnectFixture) -> None:
    await remember(connect, fact("skostorlek", "44 (EU)", evidence=[{"source": "user"}]))
    [again] = await remember(connect, fact("Skostorlek", "44  (eu)", evidence=[{"source": "user"}, {"source": "gmail", "ref": "order-1"}]))

    assert again["outcome"] == "known"
    assert again["fact"]["confirm_count"] == 2
    assert [e["source"] for e in again["fact"]["evidence"]] == ["user", "gmail"]
    assert len(await search(connect, query="skostorlek")) == 1

  @pytest.mark.asyncio
  async def test_a_different_value_is_a_conflict_and_changes_nothing(self, connect: ConnectFixture) -> None:
    [first] = await remember(connect, fact("skostorlek", "44 (EU)"))
    [again] = await remember(connect, fact("SKOSTORLEK", "45", area="Kropp/Kläder"))

    assert again["outcome"] == "conflict"
    assert again["fact"]["id"] == first["fact"]["id"]
    assert [f["statement"] for f in await search(connect, query="skostorlek")] == ["44 (EU)"]

  @pytest.mark.asyncio
  async def test_the_same_attribute_can_mean_different_things_in_different_areas(self, connect: ConnectFixture) -> None:
    [voice] = await remember(connect, fact("ton", "Rak och tuff", area="preferenser"))
    [music] = await remember(connect, fact("Ton", "Gillar moll", area="musik"))

    assert music["outcome"] == "added"
    assert [s["id"] for s in music["similar"]] == [voice["fact"]["id"]]
    assert {f["statement"] for f in await search(connect, query="ton")} >= {"Rak och tuff", "Gillar moll"}

  @pytest.mark.asyncio
  async def test_only_whole_uncommon_words_make_facts_similar(self, connect: ConnectFixture) -> None:
    await remember(connect, fact("varför du skjuter upp", "Perfektionism", area="arbete"), fact("sömnsteg", "02:00", area="sömn"))
    [why, sleep] = await remember(connect, fact("varför du jobbar sent", "Tomhet", area="arbete"), fact("sömn", "Dålig", area="hälsa"))

    assert why["similar"] == []
    assert sleep["similar"] == []

  @pytest.mark.asyncio
  async def test_a_conclusion_is_a_hypothesis_until_seen_three_times(self, connect: ConnectFixture) -> None:
    conclusion = guess("sena kvällar", "Somnar sent efter kvällscall", [await known(connect)], area="sömn")

    [first] = await remember(connect, conclusion)
    [second] = await remember(connect, conclusion)
    [third] = await remember(connect, conclusion)

    assert (first["fact"]["status"], second["fact"]["status"], third["fact"]["status"]) == ("hypothesis", "hypothesis", "confirmed")

  @pytest.mark.asyncio
  async def test_a_conclusion_must_name_the_facts_it_was_checked_against(self, connect: ConnectFixture) -> None:
    [theirs] = await remember(connect, fact("hyra", "Betalar 9 000 i månaden"), token="token-b")

    unchecked, elsewhere, alongside = await remember(
      connect,
      fact("kostnad utomlands", "Billigare att bo i Asien", kind="inferred"),
      guess("kronotyp", "Kvällsmänniska", [theirs["fact"]["id"]], area="rytm"),
      fact("skostorlek", "44"),
    )

    assert (unchecked["outcome"], unchecked["fact"]) == ("unchecked", None)
    assert (elsewhere["outcome"], elsewhere["fact"]) == ("unchecked", None)
    assert alongside["outcome"] == "added"
    assert [f["attribute"] for f in await search(connect)] == ["skostorlek"]

  @pytest.mark.asyncio
  async def test_a_conclusion_keeps_the_facts_it_rests_on_as_evidence(self, connect: ConnectFixture) -> None:
    rent = await known(connect)
    [theirs] = await remember(connect, fact("hyra", "Betalar 9 000 i månaden"), token="token-b")

    [result] = await remember(connect, guess("kronotyp", "Kvällsmänniska", [rent, theirs["fact"]["id"]], area="rytm"))

    assert result["fact"]["evidence"] == [{"source": "memory", "ref": rent, "day": None, "note": None}]

  @pytest.mark.asyncio
  async def test_the_user_saying_it_confirms_a_hypothesis(self, connect: ConnectFixture) -> None:
    await remember(connect, guess("kronotyp", "Kvällsmänniska", [await known(connect)], area="rytm"))
    [said] = await remember(connect, fact("kronotyp", "Kvällsmänniska", area="rytm"))

    assert said["fact"]["status"] == "confirmed"

  @pytest.mark.asyncio
  async def test_related_facts_are_offered_for_merging(self, connect: ConnectFixture) -> None:
    [shoes] = await remember(connect, fact("skostorlek löparskor", "45"))
    [unrelated] = await remember(connect, fact("jeansstorlek", "32/32"))
    [added] = await remember(connect, fact("skostorlek kängor", "44"))

    assert added["outcome"] == "added"
    assert [s["id"] for s in added["similar"]] == [shoes["fact"]["id"]]
    assert unrelated["similar"] == []

  @pytest.mark.asyncio
  async def test_facts_about_the_same_things_are_offered_to_check_against(self, connect: ConnectFixture) -> None:
    [home] = await remember(connect, fact("ekonomi hemma", "Mamma äger huset och betalar maten; du betalar bredbandet", area="hem"))
    await remember(connect, fact("skostorlek", "44"), fact("mammas jobb", "Mamma är revisor", area="människor"))

    [added] = await remember(connect, fact("kostnad utomlands", "Huset och maten kostar mer i Asien", area="resor"))

    assert [s["id"] for s in added["similar"]] == [home["fact"]["id"]]

  @pytest.mark.asyncio
  async def test_facts_already_checked_are_not_offered_again(self, connect: ConnectFixture) -> None:
    [home] = await remember(connect, fact("ekonomi hemma", "Mamma äger huset och betalar maten", area="hem"))

    [added] = await remember(connect, guess("kostnad utomlands", "Huset och maten kostar mer i Asien", [home["fact"]["id"]], area="resor"))

    assert added["similar"] == []

  @pytest.mark.asyncio
  async def test_what_only_others_wrote_stays_an_unimportant_hypothesis(self, connect: ConnectFixture) -> None:
    [mailed, seen] = await remember(
      connect,
      fact("favoritbutik", "Handlar på Hoka", kind="observed", importance=5, evidence=[{"source": "gmail", "ref": "nyhetsbrev"}]),
      fact("läggdags", "Släcker 02", area="sömn", kind="observed", importance=5, evidence=[{"source": "gmail"}, {"source": "sleep", "ref": "90 nätter"}]),
    )

    assert (mailed["fact"]["status"], mailed["fact"]["importance"]) == ("hypothesis", 3)
    assert (seen["fact"]["status"], seen["fact"]["importance"]) == ("confirmed", 5)
    assert [f["attribute"] for a in (await mcp_call(connect, "get_profile"))["profile"] for f in a["facts"]] == ["läggdags"]


class TestProfile:
  @pytest.mark.asyncio
  async def test_nothing_known_yet(self, connect: ConnectFixture) -> None:
    profile = await mcp_call(connect, "get_profile")

    assert profile == {"profile": [], "areas": [], "recently_changed": [], "withheld": [], "total_facts": 0, "truncated": False}

  @pytest.mark.asyncio
  async def test_holds_what_matters_most_by_area_and_counts_the_rest(self, connect: ConnectFixture) -> None:
    [shoes] = await remember(connect, fact("skostorlek", "44", importance=2))
    await remember(
      connect,
      fact("sömnmål", "Släckt 02:00, upp 10:15", area="sömn", importance=5),
      guess("kronotyp", "Kvällsmänniska", [shoes["fact"]["id"]], area="sömn", importance=4),
    )

    profile = await mcp_call(connect, "get_profile")

    assert [(a["area"], [(f["attribute"], f["status"]) for f in a["facts"]]) for a in profile["profile"]] == [
      ("sömn", [("sömnmål", "confirmed"), ("kronotyp", "hypothesis")]),
    ]
    assert profile["areas"] == [{"area": "kropp/kläder", "facts": 1}, {"area": "sömn", "facts": 2}]
    assert profile["total_facts"] == 3
    assert {f["attribute"] for f in profile["recently_changed"]} == {"sömnmål", "kronotyp", "skostorlek"}

  @pytest.mark.asyncio
  async def test_sensitive_facts_come_only_when_asked_for(self, connect: ConnectFixture) -> None:
    await remember(
      connect,
      fact("sömnmål", "Släckt 02:00", area="sömn", importance=5),
      fact("blodtryck", "140/90", area="hälsa", importance=5, sensitivity="health"),
      fact("lån", "Inga lån", area="pengar", importance=4, sensitivity="money"),
      fact("ex", "Saknar henne", area="människor", importance=4, sensitivity="private"),
    )

    default = await mcp_call(connect, "get_profile")
    health = await mcp_call(connect, "get_profile", {"sensitive": ["health"]})

    def attributes(profile: dict[str, Any]) -> set[str]:
      return {f["attribute"] for area in profile["profile"] for f in area["facts"]}

    assert attributes(default) == {"sömnmål"}
    assert {f["attribute"] for f in default["recently_changed"]} == {"sömnmål"}
    assert default["withheld"] == [{"sensitivity": "health", "facts": 1}, {"sensitivity": "money", "facts": 1}, {"sensitivity": "private", "facts": 1}]
    assert attributes(health) == {"sömnmål", "blodtryck"}
    assert health["withheld"] == [{"sensitivity": "money", "facts": 1}, {"sensitivity": "private", "facts": 1}]
    assert default["areas"] == health["areas"]

  @pytest.mark.asyncio
  async def test_stops_at_its_size_budget_keeping_the_most_important(self, connect: ConnectFixture, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "PROFILE_MAX_CHARS", 25)
    await remember(connect, fact("viktigt", "Tjugo tecken långt...", area="a", importance=4))
    await remember(connect, fact("viktigast", "Tjugo tecken långt...", area="b", importance=5))

    profile = await mcp_call(connect, "get_profile")

    assert [(a["area"], [f["attribute"] for f in a["facts"]]) for a in profile["profile"]] == [("b", ["viktigast"])]
    assert profile["truncated"] is True

  @pytest.mark.asyncio
  async def test_leaves_out_what_ended_or_was_rejected(self, connect: ConnectFixture) -> None:
    rest = await known(connect)
    [ended, rejected] = await remember(
      connect,
      fact("gym", "Member24", area="träning", importance=5),
      guess("trigger", "Kaffe efter 14 ger sen insomning", [rest], area="sömn", importance=5),
    )
    await revise(
      connect,
      {"fact_id": ended["fact"]["id"], "action": "end"},
      {"fact_id": rejected["fact"]["id"], "action": "reject"},
      {"fact_id": rest, "action": "end"},
    )

    profile = await mcp_call(connect, "get_profile")

    assert profile["profile"] == []
    assert profile["total_facts"] == 0
    history = {f["attribute"]: f["status"] for f in await search(connect, include_past=True)}
    assert history == {"gym": "confirmed", "trigger": "rejected", "läggdags": "confirmed"}
    assert [f["attribute"] for f in await search(connect, status="rejected", include_past=True)] == ["trigger"]

  @pytest.mark.asyncio
  async def test_only_the_users_own_facts_are_seen_or_stored(self, connect: ConnectFixture) -> None:
    await remember(connect, fact("skostorlek", "44", importance=5))

    other = await mcp_call(connect, "get_profile", token="token-b")

    assert other["total_facts"] == 0
    assert (await mcp_call(connect, "search_memory", {"query": "skostorlek"}, token="token-b"))["facts"] == []
    assert (await remember(connect, fact("skostorlek", "39"), token="token-b"))[0]["outcome"] == "added"


class TestRevise:
  @pytest.mark.asyncio
  async def test_superseding_closes_the_old_fact_and_keeps_its_history(self, connect: ConnectFixture) -> None:
    [old] = await remember(connect, fact("stad", "Bor i Västerås", area="identitet", valid_from="2025-01-01"))

    [result] = await revise(connect, {"fact_id": old["fact"]["id"], "action": "supersede", "statement": "Bor i Stockholm", "ended_on": "2026-03-01"})

    new = result["fact"]
    assert (new["statement"], new["valid_from"], new["valid_to"]) == ("Bor i Stockholm", "2026-03-01", None)
    assert [f["statement"] for f in await search(connect, query="stad")] == ["Bor i Stockholm"]
    assert [f["statement"] for f in await search(connect, query="stad", as_of="2025-06-01")] == ["Bor i Västerås"]
    assert [f["statement"] for f in await search(connect, query="stad", as_of="2026-06-01")] == ["Bor i Stockholm"]
    [closed] = [f for f in await search(connect, query="stad", include_past=True) if f["id"] == old["fact"]["id"]]
    assert (closed["valid_to"], closed["superseded_by_id"]) == ("2026-03-01", new["id"])

  @pytest.mark.asyncio
  async def test_merging_keeps_one_fact_with_both_facts_evidence(self, connect: ConnectFixture) -> None:
    [keep, fold] = await remember(
      connect,
      fact("löparskor", "Hoka, storlek 45", importance=2, evidence=[{"source": "gmail", "ref": "a"}]),
      fact("skomärke", "Gillar Hoka", importance=4, evidence=[{"source": "user"}]),
    )

    [result] = await revise(
      connect, {"fact_id": fold["fact"]["id"], "action": "merge", "into_id": keep["fact"]["id"], "statement": "Springer i Hoka, storlek 45"}
    )

    merged = result["fact"]
    assert merged["id"] == keep["fact"]["id"]
    assert (merged["statement"], merged["importance"], merged["confirm_count"]) == ("Springer i Hoka, storlek 45", 4, 2)
    assert [e["source"] for e in merged["evidence"]] == ["gmail", "user"]
    assert [f["id"] for f in await search(connect, area="kropp")] == [keep["fact"]["id"]]

  @pytest.mark.asyncio
  async def test_confirming_promotes_a_hypothesis_and_adds_evidence(self, connect: ConnectFixture) -> None:
    [conclusion] = await remember(connect, guess("kronotyp", "Kvällsmänniska", [await known(connect)], area="rytm"))

    [result] = await revise(connect, {"fact_id": conclusion["fact"]["id"], "action": "confirm", "evidence": [{"source": "sleep", "ref": "90 nätter"}]})

    assert (result["fact"]["status"], result["fact"]["confirm_count"]) == ("confirmed", 2)
    assert result["fact"]["evidence"][-1]["ref"] == "90 nätter"

  @pytest.mark.asyncio
  async def test_a_bad_change_fails_alone(self, connect: ConnectFixture) -> None:
    [shoes, jeans] = await remember(connect, fact("skostorlek", "44"), fact("jeansstorlek", "32/32"))

    taken, fixed = await revise(
      connect,
      {"fact_id": jeans["fact"]["id"], "action": "update", "attribute": "Skostorlek"},
      {"fact_id": shoes["fact"]["id"], "action": "update", "statement": "44,5", "importance": 4},
    )

    assert taken["fact"] is None
    assert shoes["fact"]["id"] in taken["error"]
    assert fixed["error"] is None
    assert (fixed["fact"]["statement"], fixed["fact"]["importance"]) == ("44,5", 4)

  @pytest.mark.asyncio
  async def test_moving_a_fact_only_clashes_within_its_new_area(self, connect: ConnectFixture) -> None:
    [shoes, _, boots] = await remember(
      connect, fact("skostorlek", "44"), fact("skostorlek", "45 i kängor", area="friluftsliv"), fact("kängor", "Lundhags", area="friluftsliv")
    )

    renamed, moved = await revise(
      connect,
      {"fact_id": boots["fact"]["id"], "action": "update", "attribute": "Skostorlek"},
      {"fact_id": shoes["fact"]["id"], "action": "update", "area": "kropp"},
    )

    assert renamed["fact"] is None
    assert "friluftsliv" in renamed["error"]
    assert (moved["error"], moved["fact"]["area"]) == (None, "kropp")

  @pytest.mark.asyncio
  async def test_an_ended_fact_cannot_change_again(self, connect: ConnectFixture) -> None:
    [old] = await remember(connect, fact("skostorlek", "44"))
    await revise(connect, {"fact_id": old["fact"]["id"], "action": "supersede", "statement": "45"})

    [again] = await revise(connect, {"fact_id": old["fact"]["id"], "action": "update", "statement": "46"})

    assert again["fact"] is None
    assert "already ended" in again["error"]

  @pytest.mark.asyncio
  async def test_another_users_fact_is_not_found(self, connect: ConnectFixture) -> None:
    [theirs] = await remember(connect, fact("skostorlek", "39"), token="token-b")

    [result] = await revise(connect, {"fact_id": theirs["fact"]["id"], "action": "end"})

    assert result["error"].startswith("No fact")


class TestSearch:
  @pytest.mark.asyncio
  async def test_any_word_finds_and_the_most_words_come_first(self, connect: ConnectFixture) -> None:
    await remember(
      connect,
      fact("bror", "Bor i Göteborg", area="människor/familj", importance=5),
      fact("mamma", "Födelsedag 3 maj", area="människor/familj", importance=1),
      fact("människokännare", "Läser folk bra", area="människorelationer"),
    )

    assert [f["attribute"] for f in await search(connect, query="mamma födelsedag göteborg")] == ["mamma", "bror"]
    assert {f["attribute"] for f in await search(connect, area="människor")} == {"mamma", "bror"}

  @pytest.mark.asyncio
  async def test_word_forms_and_compounds_match_but_not_lookalikes(self, connect: ConnectFixture) -> None:
    await remember(
      connect,
      fact("boende", "Bor hyresfritt hos mamma", area="hem"),
      fact("lägenhet", "Betalar månadshyra på 9 000", area="hem"),
      fact("hyllan", "Hyllan är full", area="hem"),
      fact("gym", "Gymmet ligger 25 minuter bort", area="träning"),
    )

    assert {f["attribute"] for f in await search(connect, query="hyra")} == {"boende", "lägenhet"}
    assert [f["attribute"] for f in await search(connect, query="gymet")] == ["gym"]

  @pytest.mark.asyncio
  async def test_stop_words_alone_find_nothing(self, connect: ConnectFixture) -> None:
    await remember(connect, fact("boende", "Bor hos mamma och betalar inte hyra", area="hem"))

    assert await search(connect, query="och inte") == []

  @pytest.mark.asyncio
  async def test_wildcards_in_the_query_are_plain_text(self, connect: ConnectFixture) -> None:
    await remember(connect, fact("rabatt", "10% på Hoka"), fact("annat", "Inget procent här"))

    assert [f["attribute"] for f in await search(connect, query="10%")] == ["rabatt"]
    assert await search(connect, query="_") == []
