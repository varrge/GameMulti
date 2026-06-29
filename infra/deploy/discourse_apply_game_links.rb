require "uri"

def gm_url(origin, path)
  URI.join("#{origin}/", path.sub(%r{\A/+}, "")).to_s
end

begin
  bridge_origin = ENV.fetch("GM_BRIDGE_PUBLIC_ORIGIN")
  category_name = ENV.fetch("GM_FORUM_CATEGORY_NAME", "游戏绑定")
  topic_title = ENV.fetch("GM_FORUM_TOPIC_TITLE", "游戏绑定与服务器接入")
  account_url = gm_url(bridge_origin, "/bind/account")
  admin_url = gm_url(bridge_origin, "/api/admin/plugin-client-generator")
  user = Discourse.system_user

  category = Category.find_by(name: category_name) || Category.create!(
    name: category_name,
    color: "F27D26",
    text_color: "FFFFFF",
    user_id: user.id,
  )

  raw = <<~MD
    ## 游戏绑定

    - [我的游戏绑定](#{account_url})
    - [插件安装和服务器审核](#{admin_url})

    绑定确认、服务器接入凭证和审核仍由 GameMulti Bridge 处理；论坛负责注册、登录和社区内容。
  MD

  topic = Topic.find_by(title: topic_title, category_id: category.id)
  if topic
    first_post = Post.find_by(topic_id: topic.id, post_number: 1)
    first_post.update!(raw: raw, cooked: PrettyText.cook(raw)) if first_post && first_post.raw != raw
  else
    post = PostCreator.create!(
      user,
      title: topic_title,
      raw: raw,
      category: category.id,
      skip_validations: true,
    )
    topic = post.topic
  end

  topic.update!(pinned_at: Time.zone.now, pinned_globally: true, visible: true)

  puts({
    ok: true,
    gamemulti_forum_links: {
      category_id: category.id,
      topic_id: topic.id,
      account_url: account_url,
      admin_url: admin_url,
    },
  }.to_json)
rescue => e
  puts({
    ok: false,
    gamemulti_forum_links_error: "#{e.class}: #{e.message}",
  }.to_json)
end
